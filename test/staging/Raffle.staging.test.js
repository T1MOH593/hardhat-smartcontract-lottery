const { assert, expect } = require("chai")
const { deployments, getNamedAccounts, ethers, network } = require("hardhat")
const { isCallTrace } = require("hardhat/internal/hardhat-network/stack-traces/message-trace")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")

const entranceAmount = ethers.utils.parseEther("0.0005")
developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle", function () {
          let raffle, deployer

          beforeEach(async () => {
              deployer = (await getNamedAccounts()).deployer
              raffle = await ethers.getContract("Raffle", deployer)
          })

          describe("fulfillRandomWords", function () {
              it("enters raffle, picks the winner, pays money", async () => {
                  const startingLatestTimestamp = await raffle.getLatestTimestamp()
                  const accounts = await ethers.getSigners()

                  await new Promise(async (resolve, reject) => {
                      try {
                          raffle.once("WinnerPicked", async () => {
                              const endingWinnerBalance = await accounts[0].getBalance()
                              const endingRaffleState = await raffle.getRaffleState()
                              const endingNumberOfPlayers = await raffle.getNumberOfPlayers()
                              const endingLatestTimestamp = await raffle.getLatestTimestamp()

                              assert.equal(endingRaffleState, "0")
                              assert.equal(endingNumberOfPlayers, "0")
                              assert(endingLatestTimestamp > startingLatestTimestamp)
                              assert.equal(
                                  startingWinnerBalance.add(entranceAmount).toString(),
                                  endingWinnerBalance.toString()
                              )
                          })

                          console.log("Entering Raffle...")
                          const tx = await raffle.enterRaffle({ value: entranceAmount, gasLimit: 500000 })
                          await tx.wait(1)
                          console.log("Time to wait....")
                          const startingWinnerBalance = await accounts[0].getBalance()
                      } catch (e) {
                          reject(e)
                      }
                      resolve()
                  })
              })
          })
      })
