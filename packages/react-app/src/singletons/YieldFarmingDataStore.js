import EPNSCoreHelper from "helpers/EPNSCoreHelper";
import { ethers } from "ethers";
import { bigNumber } from "ethers/utils";

import { addresses, abis } from "@project/contracts";

const ONE_PUSH = ethers.BigNumber.from(1).mul(
  ethers.BigNumber.from(10).pow(ethers.BigNumber.from(18))
);
const GENESIS_EPOCH_AMOUNT_PUSH = 30000
const GENESIS_EPOCH_AMOUNT_LP = 35000

const tokenToBn = (token) => {
  return token.mul(ethers.BigNumber.from(10).pow(ethers.BigNumber.from(18)))
}

const tokenBNtoNumber = (tokenBn) => {
  return tokenBn.div(ethers.BigNumber.from(10).pow(ethers.BigNumber.from(18))).toNumber()
}

export default class YieldFarmingDataStore {
  static instance =
    YieldFarmingDataStore.instance || new YieldFarmingDataStore();

  state = {
    account: null,
    signer: null,
    staking: null,
    yieldFarmingPUSH: null,
    yieldFarmingLP: null,
    rewardForCurrentEpochPush: null,
    rewardForCurrentEpochLP: null,
    genesisEpochAmountPUSH: GENESIS_EPOCH_AMOUNT_PUSH,
    deprecationPerEpochPUSH: 100,
    genesisEpochAmountLP: GENESIS_EPOCH_AMOUNT_LP,
    deprecationPerEpochLP: 100,
  };

  // init
  init = (account, epnsToken, staking, yieldFarmingPUSH, yieldFarmingLP, uniswapV2Router02) => {
    // set account
    this.state.account = account;
    this.state.epnsToken = epnsToken;
    this.state.staking = staking;
    this.state.yieldFarmingPUSH = yieldFarmingPUSH;
    this.state.yieldFarmingLP = yieldFarmingLP;
    this.state.uniswapV2Router02 = uniswapV2Router02;
  };

  // 1. Listen for Subscribe Async
  getPoolStats = () => {
    return new Promise(async (resolve, reject) => {
      const yieldFarmingPUSH = this.state.yieldFarmingPUSH;
      const yieldFarmingLP = this.state.yieldFarmingLP;

      const currentEpochPUSH = await yieldFarmingPUSH.getCurrentEpoch();

      const pushPriceAmounts = await this.state.uniswapV2Router02.getAmountsOut(ONE_PUSH.toString(), [addresses.epnsToken, addresses.WETHAddress, addresses.USDTAddress]);
      const pushPrice = pushPriceAmounts[pushPriceAmounts.length -1].toNumber()/1000000;

      const pushAmountReserve = tokenBNtoNumber(await this.state.epnsToken.balanceOf(addresses.epnsLPToken))
      const wethAmountReserve = tokenBNtoNumber(await this.state.epnsToken.attach(addresses.WETHAddress).balanceOf(addresses.epnsLPToken)) // Using epnsToken instance for WETH instance

      const ethPriceAmounts = await this.state.uniswapV2Router02.getAmountsOut(ONE_PUSH.toString(), [addresses.WETHAddress, addresses.USDTAddress]);
      const ethPrice = ethPriceAmounts[ethPriceAmounts.length -1].toNumber()/1000000;

      const uniTotalSupply = tokenBNtoNumber(await this.state.epnsToken.attach(addresses.epnsLPToken).totalSupply()) // Using epnsToken instance for Uni-V2 instance

      const uniLpPrice = ((pushAmountReserve * pushPrice) + (wethAmountReserve * ethPrice)) / uniTotalSupply

      const pushNextPoolSize = tokenBNtoNumber(await yieldFarmingPUSH.getPoolSize(currentEpochPUSH.add(1)));
      const lpNextPoolSize = tokenBNtoNumber(await yieldFarmingLP.getPoolSize(currentEpochPUSH.add(1)));

      const totalValueLocked = (pushNextPoolSize * pushPrice) + (lpNextPoolSize * uniLpPrice)

      const epochDuration = await yieldFarmingPUSH.epochDuration();

      const epochStart = await yieldFarmingPUSH.epochStart();

      const start = epochStart.add(currentEpochPUSH.sub(1).mul(epochDuration));
      const epochEndTimestamp = start.add(epochDuration);

      const pushTotalDistributedAmount = await yieldFarmingPUSH.TOTAL_DISTRIBUTED_AMOUNT();
      const lpTotalDistributedAmount = await yieldFarmingLP.TOTAL_DISTRIBUTED_AMOUNT();

      const totalDistributedAmount = pushTotalDistributedAmount.add(
        lpTotalDistributedAmount
      );

      const pushRewardsDistributed = await this.getPushRewardsDistributed();

      resolve({
        totalValueLocked,
        pushPrice,
        epochEndTimestamp,
        totalDistributedAmount,
        pushRewardsDistributed
      });
    });
  };

  // 1. Listen for Subscribe Async
  getPUSHPoolStats = async () => {
    return new Promise(async (resolve, reject) => {
      const epnsToken = this.state.epnsToken;
      const staking = this.state.staking;
      const yieldFarmingPUSH = this.state.yieldFarmingPUSH;

      const currentEpochPUSH = await yieldFarmingPUSH.getCurrentEpoch();
      const totalEpochPUSH = (await yieldFarmingPUSH.NR_OF_EPOCHS()).toString();

      const genesisEpochAmount = tokenToBn(ethers.BigNumber.from(this.state.genesisEpochAmountPUSH));
      const deprecationPerEpoch = tokenToBn(ethers.BigNumber.from(this.state.deprecationPerEpochPUSH));

      const rewardForCurrentEpoch = this.calcTotalAmountPerEpoch(
        genesisEpochAmount,
        currentEpochPUSH,
        deprecationPerEpoch
      );

      this.state.rewardForCurrentEpochPush = rewardForCurrentEpoch;

      const poolBalance = await yieldFarmingPUSH.getPoolSize(
        currentEpochPUSH.add(1)
      );

      resolve({
        currentEpochPUSH,
        totalEpochPUSH,
        rewardForCurrentEpoch,
        poolBalance,
      });
    });
  };

  getLPPoolStats = async () => {
    return new Promise(async (resolve, reject) => {
      const epnsToken = this.state.epnsToken;
      const staking = this.state.staking;
      const yieldFarmingLP = this.state.yieldFarmingLP;

      const currentEpochPUSH = await yieldFarmingLP.getCurrentEpoch();
      const totalEpochPUSH = (await yieldFarmingLP.NR_OF_EPOCHS()).toString();
      const genesisEpochAmount = tokenToBn(ethers.BigNumber.from(this.state.genesisEpochAmountLP));
      const deprecationPerEpoch = tokenToBn(ethers.BigNumber.from(this.state.deprecationPerEpochLP));

      const rewardForCurrentEpoch = this.calcTotalAmountPerEpoch(
        genesisEpochAmount,
        currentEpochPUSH,
        deprecationPerEpoch
      );

      this.state.rewardForCurrentEpochLP = rewardForCurrentEpoch;

      const poolBalance = await yieldFarmingLP.getPoolSize(
        currentEpochPUSH.add(1)
      );

      resolve({
        currentEpochPUSH,
        totalEpochPUSH,
        rewardForCurrentEpoch,
        poolBalance,
      });
    });
  };

  // 1. Listen for Subscribe Async
  getUserData = async (contract) => {
    return new Promise(async (resolve, reject) => {
      if (this.state.account) {
        const epnsToken = this.state.epnsToken;
        const staking = this.state.staking;
        const currentEpochPUSH = await contract.getCurrentEpoch();

        const userPUSHStakeBalance = await staking.balanceOf(
          this.state.account,
          epnsToken.address
        );

        const epochStake = tokenBNtoNumber(await contract.getEpochStake(
          this.state.account,
          currentEpochPUSH
        ));

        const poolSize = tokenBNtoNumber(await contract.getPoolSize(currentEpochPUSH));

        let potentialUserReward = 0;
        if (poolSize > 0) {
          if (contract.address == addresses.yieldFarmLP) {
            const rewardForCurrentEpoch = tokenBNtoNumber(this.state.rewardForCurrentEpochLP)
            potentialUserReward = epochStake / poolSize * rewardForCurrentEpoch
          }
          else {
            const rewardForCurrentEpoch = tokenBNtoNumber(this.state.rewardForCurrentEpochLP)
            potentialUserReward = epochStake / poolSize * rewardForCurrentEpoch
          }

        }

        potentialUserReward = potentialUserReward.toFixed(2)

        const epochStakeNext = await contract.getEpochStake(
          this.state.account,
          currentEpochPUSH.add(1)
        );

        resolve({
          userPUSHStakeBalance,
          potentialUserReward,
          epochStakeNext,
        });
      }
    });
  };

  getPushRewardsDistributed = async () => {
    const yieldFarmingPUSH = this.state.yieldFarmingPUSH;
    const yieldFarmingLP = this.state.yieldFarmingLP;

    const currentEpochPUSH = await yieldFarmingPUSH.getCurrentEpoch();
    const genesisEpochAmountPUSH = tokenToBn(ethers.BigNumber.from(this.state.genesisEpochAmountPUSH))
    const deprecationPerEpochPUSH = tokenToBn(ethers.BigNumber.from(this.state.deprecationPerEpochPUSH))
    const currentEpochLP = await yieldFarmingLP.getCurrentEpoch();
    const genesisEpochAmountLP = tokenToBn(ethers.BigNumber.from(this.state.genesisEpochAmountLP))
    const deprecationPerEpochLP = tokenToBn(ethers.BigNumber.from(this.state.deprecationPerEpochLP))

    let pushPoolRewardsDistributed = ethers.BigNumber.from(0);
    let lpPoolRewardsDistributed = ethers.BigNumber.from(0);

    for(var i=0; i<currentEpochLP.toNumber(); i++){
      const rewardForCurrentEpochLP = this.calcTotalAmountPerEpoch(
        genesisEpochAmountLP,
        ethers.BigNumber.from(i),
        deprecationPerEpochLP
      );

      lpPoolRewardsDistributed = lpPoolRewardsDistributed.add(rewardForCurrentEpochLP);

      const rewardForCurrentEpochPUSH = this.calcTotalAmountPerEpoch(
        genesisEpochAmountPUSH,
        ethers.BigNumber.from(i),
        deprecationPerEpochPUSH
      );

      pushPoolRewardsDistributed = pushPoolRewardsDistributed.add(rewardForCurrentEpochPUSH);
    }

    return pushPoolRewardsDistributed.add(lpPoolRewardsDistributed)
  }

  calcTotalAmountPerEpoch = (
    genesisEpochAmount,
    epochId,
    deprecationPerEpoch
  ) => {
    return genesisEpochAmount.sub(epochId.mul(deprecationPerEpoch));
  };
}
