const { getNamedAccounts, deployments, network } = require("hardhat")
const { networkConfig, developmentChains } = require("../helper-hardhat-config")
const { verify } = require("../utils/verify")

const FUND_SUBSCRIPTION_AMOUNT = ethers.utils.parseEther("3")
module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()
    const chainId = network.config.chainId

    let vrfCoordinatorV2Address, subscriptionId
    if (developmentChains.includes(network.name)) {
        const vrfCoordinatorV2Contract = await ethers.getContract("VRFCoordinatorV2Mock")
        vrfCoordinatorV2Address = vrfCoordinatorV2Contract.address
        const txResponse = await vrfCoordinatorV2Contract.createSubscription()
        const txReceipt = await txResponse.wait(1)
        subscriptionId = txReceipt.events[0].args.subId
        await vrfCoordinatorV2Contract.fundSubscription(subscriptionId, FUND_SUBSCRIPTION_AMOUNT)
    } else {
        vrfCoordinatorV2Address = networkConfig[chainId]["vrfCoordinatorV2"]
        subscriptionId = networkConfig[chainId]["subscriptionId"]
    }
    const gasLane = networkConfig[chainId]["gasLane"]
    const calbackGasLimit = networkConfig[chainId]["calbackGasLimit"]
    const interval = networkConfig[chainId]["interval"]
    const args = [vrfCoordinatorV2Address, gasLane, subscriptionId, calbackGasLimit, interval]
    const raffle = await deploy("Raffle", {
        from: deployer,
        args: args,
        log: true,
        // we need to wait if on a live network so we can verify properly
        waitConfirmations: network.config.blockConfirmations || 1,
    })
    log(`Raffle deployed at ${raffle.address}`)

    if (!developmentChains.includes(network.name) && process.env.ETHERSCAN_API_KEY) {
        log("Verifying...")
        await verify(raffle.address, [args])
    }
}

module.exports.tags = ["all", "raffle"]
