const LDBNFTs = artifacts.require('LDBNFTs');
const NFTCsrowdsale = artifacts.require('NFTsCrowdsale');
const Erc20TokenMock = artifacts.require('LORDLESS_TOKEN');
const { balanceOf, ether2wei } = require('./helpers/etherUtils');
const { duration } = require('./helpers/increaseTime');
const BigNumber = web3.BigNumber;
require('chai')
  .use(require('chai-as-promised'))
  .use(require('chai-bignumber')(BigNumber))
  .should();

contract('LdbNFTCrowdsale', function (accounts) {
  before(async function () {
    // Maximum allowable error
    this.maError = parseInt(web3.toWei(1, 'gwei'));
    this.eth2erc20 = 41666;
    this.price = 0.5e18;
    this.ethPrice = parseInt(this.price / this.eth2erc20);
    this._tokenId = 1;
    this.seller = accounts[0];
    this.buyer = accounts[1];
    this.endAt = web3.eth.getBlock('latest').timestamp + duration.minutes(5);
  });
  beforeEach(async function () {
    this.LDBNFTs = await LDBNFTs.new('LDB NFT', 'LDB', { from: accounts[0] });
    this.erc20Token = await Erc20TokenMock.new();
    this.NFTsCrowdsale = await NFTCsrowdsale.new(this.LDBNFTs.address, this.erc20Token.address, this.eth2erc20);
    // mint erc20 token
    await this.erc20Token.mint(accounts[0], 5e27);
    await this.erc20Token.mint(accounts[1], 5e27);
    // mint erc721 token
    await this.LDBNFTs.mint(accounts[0], this._tokenId);
    // Set Approval For Crowdsale Contract
    await this.LDBNFTs.setApprovalForAll(this.NFTsCrowdsale.address, true, { from: accounts[0] });

    await this.NFTsCrowdsale.newAuction(this.price, this._tokenId, this.endAt, { from: this.seller });
  });

  it('should get auction success', async function () {
    const auction = await this.NFTsCrowdsale.getAuction(this._tokenId);
    // should be seller
    auction[0].should.be.equal(accounts[0]);
    // should be price
    auction[1].should.be.bignumber.equal(this.price);
    //  should be endAt
    auction[2].should.be.bignumber.equal(this.endAt);
    // should be token_id
    auction[3].should.be.bignumber.equal(this._tokenId);
  });

  /**
   * Defray Function Test
   */
  describe('pay by eth: success', function () {
    beforeEach(async function () {
      // pay success
      this.preBalance = (await web3.eth.getBalance(this.seller)).toNumber();
      const { logs } = await this.NFTsCrowdsale.payByEth(this._tokenId, {
        value: this.price,
        from: this.buyer,
      });
      this.logs = logs;
    });

    it('shuould change token ownership', async function () {
      // check ownership of _tokenId should be change to buyer
      (await this.LDBNFTs.ownerOf(this._tokenId)).should.be.equal(this.buyer);
    });

    it('shuould add price_count ether to seller', async function () {
      const finalCount = (await web3.eth.getBalance(this.seller)).toNumber();
      const computedCount = this.preBalance + this.price;
      // error less than 1gwei
      (finalCount - computedCount).should.be.below(this.maError);
    });
    it('events: PayByEthSuccess', async function () {
      this.logs[0].event.should.be.equal('PayByEthSuccess');
      this.logs[0].args.seller.should.be.equal(this.seller);
      this.logs[0].args.buyer.should.be.equal(this.buyer);
      this.logs[0].args.price.should.be.bignumber.equal(this.price);
      this.logs[0].args.endAt.should.be.bignumber.equal(this.endAt);
      this.logs[0].args.tokenId.should.be.bignumber.equal(this._tokenId);
    });
  });
  
  it('less ether pay: should revert', async function () {
    const buyer = accounts[1];
    await this.NFTsCrowdsale.payByEth(this._tokenId, {
      value: parseInt(this.ethPrice / 2),
      from: buyer,
    }).should.be.rejectedWith('revert');
  });

  it('pay with pay excess be should return of ', async function () {
    const payExcess = 1e18;
    const gasPrice = 100;
    const preBalance = (await web3.eth.getBalance(this.buyer)).toNumber();
    const receipt = await this.NFTsCrowdsale.payByEth(this._tokenId, {
      gasPrice,
      value: this.ethPrice + payExcess,
      from: this.buyer,
    });
    const afterDefrayBalance = (await web3.eth.getBalance(this.buyer)).toNumber();
    const gasCost = receipt.receipt.gasUsed * gasPrice;
    // payExcess should be return of
    (afterDefrayBalance - (preBalance - this.ethPrice - gasCost)).should.be.below(this.maError);
  });

  describe('pay by erc20: success', function () {
    beforeEach(async function () {
      // pay success
      this.preBalance = (await web3.eth.getBalance(this.seller)).toNumber();
      await this.erc20Token.approve(this.NFTsCrowdsale.address, 1e27, { from: this.buyer });
      const { logs } = await this.NFTsCrowdsale.payByErc20(this._tokenId, {
        from: this.buyer,
      });
      this.logs = logs;
    });

    it('shuould change token ownership', async function () {
      // check ownership of _tokenId should be change to buyer
      (await this.LDBNFTs.ownerOf(this._tokenId)).should.be.equal(this.buyer);
    });

    it('shuould add price_count ether to seller', async function () {
      const finalCount = (await web3.eth.getBalance(this.seller)).toNumber();
      const computedCount = this.preBalance + this.price;
      // error less than 1gwei
      (finalCount - computedCount).should.be.below(this.maError);
    });

    it('events: PayByErc20Success', async function () {
      this.logs[0].event.should.be.equal('PayByErc20Success');
      this.logs[0].args.seller.should.be.equal(this.seller);
      this.logs[0].args.buyer.should.be.equal(this.buyer);
      this.logs[0].args.price.should.be.bignumber.equal(this.price);
      this.logs[0].args.endAt.should.be.bignumber.equal(this.endAt);
      this.logs[0].args.tokenId.should.be.bignumber.equal(this._tokenId);
    });
  });
  it('should withdrawBalance success', async function () {
    const preBalance = (await balanceOf(accounts[0])).toNumber();
    const depositCount = ether2wei(1); // ether
    const gasPrice = 100;

    // send ether
    await this.NFTsCrowdsale.sendTransaction({ value: depositCount, from: accounts[1] });
    
    // withdrawBalance
    const receipt = await this.NFTsCrowdsale.withdrawBalance({ gasPrice });
    const finalCount = (await balanceOf(accounts[0])).toNumber();
    const gasCost = receipt.receipt.gasUsed * gasPrice;

    // check balance
    const computedCount = depositCount.toNumber() - gasCost;
    const infactCount = finalCount - preBalance;

    (computedCount - infactCount).should.be.below(this.maError);
  });

  it('revert: withdrawBalance with another address', async function () {
    await this.NFTsCrowdsale.withdrawBalance({ from: accounts[1] }).should.be.rejectedWith('revert');
  });

  it('isOnAuction should be true', async function () {
    (await this.NFTsCrowdsale.isOnAuction(this._tokenId)).should.be.equal(true);
  });

  it('isOnAuction should be false after cancelAuction ', async function () {
    const { logs } = await this.NFTsCrowdsale.cancelAuction(this._tokenId);
    (await this.NFTsCrowdsale.isOnAuction(this._tokenId)).should.be.equal(false);

    // events
    logs[0].event.should.be.equal('CancelAuction');
    logs[0].args.seller.should.be.equal(this.seller);
    logs[0].args.tokenId.should.be.bignumber.equal(this._tokenId);

    await this.NFTsCrowdsale.newAuction(this.price, this._tokenId, this.endAt, { from: this.seller });
  });

  it('ethPause & ethUnPause', async function () {
    // test ethPause
    await this.NFTsCrowdsale.ethPause();
    await this.NFTsCrowdsale.payByEth(this._tokenId, {
      value: this.price,
      from: this.buyer,
    }).should.be.rejectedWith('revert');

    // test ethUnPause
    await this.NFTsCrowdsale.ethUnPause();
    await this.NFTsCrowdsale.payByEth(this._tokenId, {
      value: this.price,
      from: this.buyer,
    }).should.to.not.rejectedWith('revert');
  });

  // events
  it('event: NewAuction', async function () {
    const _tokenId = 100;
    await this.LDBNFTs.mint(this.seller, _tokenId);
    const { logs } = await this.NFTsCrowdsale.newAuction(this.price, _tokenId, this.endAt, { from: this.seller });
    logs[0].event.should.be.equal('NewAuction');
    logs[0].args.seller.should.be.equal(this.seller);
    logs[0].args.price.should.be.bignumber.equal(this.price);
    logs[0].args.endAt.should.be.bignumber.equal(this.endAt);
    logs[0].args.tokenId.should.be.bignumber.equal(_tokenId);
  });
});
