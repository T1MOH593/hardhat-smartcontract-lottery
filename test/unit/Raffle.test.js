const { assert, expect } = require("chai")
const { deployments, getNamedAccounts, ethers, network } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")

const entranceAmount = ethers.utils.parseEther("0.2")
!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle", function () {
          let raffle, deployer, interval, vrfCoordinatorV2Mock

          beforeEach(async () => {
              deployer = (await getNamedAccounts()).deployer
              await deployments.fixture(["mocks", "raffle"])
              raffle = await ethers.getContract("Raffle", deployer)
              interval = await raffle.getInterval()
              vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock")
          })
          describe("constructor", function () {
              const chainId = network.config.chainId
              it("vrfCoordinatorV2", async () => {
                  assert(await raffle.getVrfCoordinatorV2(), vrfCoordinatorV2Mock.address)
              })
              it("gasLane", async () => {
                  assert(await raffle.getGasLane(), networkConfig[chainId]["gasLane"])
              })
              it("callbackGasLimit", async () => {
                  assert(await raffle.getCallbackGasLimit(), networkConfig[chainId]["calbackGasLimit"])
              })
              it("interval", async () => {
                  assert(await raffle.getInterval(), networkConfig[chainId]["interval"])
              })
              it("raffleState", async () => {
                  const raffleState = await raffle.getRaffleState()
                  assert(raffleState.toString(), "0")
              })
          })
          describe("enterRaffle", function () {
              it("revert when you don't pay enough", async () => {
                  await expect(raffle.enterRaffle()).to.be.revertedWith("Raffle__NotEnoughETHEntered")
              })
              it("adds player to players", async () => {
                  await raffle.enterRaffle({ value: entranceAmount })
                  assert(await raffle.getPlayer(0), deployer)
              })
              it("emits event when player enters", async () => {
                  const txResponse = await raffle.enterRaffle({ value: entranceAmount })
                  const txReceipt = await txResponse.wait(1)
                  expect(raffle.enterRaffle({ value: entranceAmount })).to.emit(raffle, "RaffleEntered")
              })
              it("reverts when raffleState is calculating", async () => {
                  await raffle.enterRaffle({ value: entranceAmount })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })

                  await raffle.performUpkeep([])

                  expect(raffle.enterRaffle({ value: entranceAmount })).to.be.revertedWith("Raffle__NotOpen")
              })
          })
          describe("checkUpkeep", function () {
              it("returns false when time interval don't passed", async () => {
                  await raffle.enterRaffle({ value: entranceAmount })
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([])
                  assert(!upkeepNeeded)
              })
              it("returns false when not enough people entered", async () => {
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })

                  const { upKeepNeeded } = await raffle.callStatic.checkUpkeep([])
                  assert(!upKeepNeeded)
              })
              it("returns false when raffleState is calulating", async () => {
                  await raffle.enterRaffle({ value: entranceAmount })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })

                  await raffle.performUpkeep([])

                  const { upKeepNeeded } = await raffle.callStatic.checkUpkeep([])
                  assert(!upKeepNeeded, (await raffle.getRaffleState()) == "1")
              })
              it("returns true when raffle is open, people entered, time passed", async () => {
                  await raffle.enterRaffle({ value: entranceAmount })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 4])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([])
                  assert(upkeepNeeded)
              })
          })
          describe("performUpkeep", function () {
              it("reverts if checkUpkeep is false", async () => {
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([])
                  assert(!upkeepNeeded)
                  await expect(raffle.performUpkeep([])).to.be.revertedWith("Raffle__UpkeepNotNeeded")
              })
              it("runs if checkUpkeep is true", async () => {
                  await raffle.enterRaffle({ value: entranceAmount })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 4])
                  await network.provider.request({ method: "evm_mine", params: [] })

                  const tx = await raffle.performUpkeep([])
                  assert(tx)
              })
              it("sets state to calculating", async () => {
                  await raffle.enterRaffle({ value: entranceAmount })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 4])
                  await network.provider.request({ method: "evm_mine", params: [] })

                  await raffle.performUpkeep([])

                  expect(await raffle.getRaffleState(), "1")
              })
              it("emits event when executed", async () => {
                  await raffle.enterRaffle({ value: entranceAmount })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 4])
                  await network.provider.request({ method: "evm_mine", params: [] })

                  const txResponse = await raffle.performUpkeep([])
                  const txReceipt = await txResponse.wait(1)
                  const requestId = txReceipt.events[1].args.requestId

                  assert(requestId.toNumber() > 0)
              })
          })
          describe("fulfillRandomWords", function () {
              beforeEach(async () => {
                  await raffle.enterRaffle({ value: entranceAmount })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 4])
                  await network.provider.request({ method: "evm_mine", params: [] })
              })
              it("can only be called after performUpkeep", async () => {
                  await expect(vrfCoordinatorV2Mock.fulfillRandomWords(0, raffle.address)).to.be.revertedWith(
                      "nonexistent request"
                  )
                  await expect(vrfCoordinatorV2Mock.fulfillRandomWords(1, raffle.address)).to.be.revertedWith(
                      "nonexistent request"
                  )
              })
              it("updates recent winner, pays to winner, resets players, sets raffleState to open", async () => {
                  const raffleEntrants = 3
                  const startingIndex = 2
                  const accounts = await ethers.getSigners()
                  for (let i = startingIndex; i < startingIndex + raffleEntrants; i++) {
                      const raffleConnectedContract = raffle.connect(accounts[i])
                      await raffleConnectedContract.enterRaffle({ value: entranceAmount })
                  }
                  const startingLatestTimestamp = await raffle.getLatestTimestamp()

                  await new Promise(async (resolve, reject) => {
                      raffle.once("WinnerPicked", async () => {
                          try {
                              const endingRecentWinnerBalance = await accounts[2].getBalance()
                              const endingRaffleState = await raffle.getRaffleState()
                              const endingNumberOfPlayers = await raffle.getNumberOfPlayers()
                              const endingLatestTimestamp = await raffle.getLatestTimestamp()

                              assert.equal(endingRaffleState, "0")
                              assert.equal(endingNumberOfPlayers, "0")
                              assert(endingLatestTimestamp > startingLatestTimestamp)
                              assert.equal(
                                  startingRecentWinnerBalance
                                      .add(entranceAmount.mul(raffleEntrants).add(entranceAmount))
                                      .toString(), // startingRecentWinnerBalance + (amount * raffleEntrants + amount)
                                  endingRecentWinnerBalance.toString()
                              )
                          } catch (e) {
                              reject(e)
                          }
                          resolve()
                      })

                      const startingRecentWinnerBalance = await accounts[2].getBalance()
                      const txResponse = await raffle.performUpkeep([])
                      const txReceipt = await txResponse.wait(1)
                      const requestId = txReceipt.events[1].args.requestId
                      await vrfCoordinatorV2Mock.fulfillRandomWords(requestId, raffle.address)
                  })
              })
          })
      })
