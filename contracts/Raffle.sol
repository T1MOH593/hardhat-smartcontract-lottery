// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";
import "@chainlink/contracts/src/v0.8/interfaces/KeeperCompatibleInterface.sol";

error Raffle__NotEnoughETHEntered();
error Raffle__TransferFailed();
error Raffle__NotOpen();
error Raffle__UpkeepNotNeeded(uint256 numPlayers, uint256 raffleState, uint256 currBalance);

contract Raffle is VRFConsumerBaseV2, KeeperCompatibleInterface {
    /* Type declarations */
    enum RaffleState {
        OPEN,
        CALCULATING
    }

    /* Storage variables */
    address[] private s_players;
    VRFCoordinatorV2Interface immutable i_vrfCoordinator;
    bytes32 private immutable i_gasLane;
    uint64 private immutable i_subscriptionId;
    uint16 private constant REQUEST_CONFIRMATIONS = 3;
    uint32 private immutable i_callbackGasLimit;
    uint32 private constant NUM_WORDS = 1;

    /* Raffle variables */
    address private s_recentWinner;
    uint256 private immutable i_interval;
    uint256 private s_latestTimestamp;
    RaffleState private s_raffleState;

    /* Events */
    event RaffleEntered(address indexed participant);
    event RequestedRandomWinner(uint256 indexed requestId);
    event WinnerPicked(address indexed winner);

    constructor(
        address vrfCoordinatorV2,
        bytes32 gasLane,
        uint64 subscriptionId,
        uint32 callbackGasLimit,
        uint256 interval
    ) VRFConsumerBaseV2(vrfCoordinatorV2) {
        i_gasLane = gasLane;
        i_vrfCoordinator = VRFCoordinatorV2Interface(vrfCoordinatorV2);
        i_subscriptionId = subscriptionId;
        i_callbackGasLimit = callbackGasLimit;
        i_interval = interval;
        s_latestTimestamp = block.timestamp;
    }

    function enterRaffle() external payable {
        if (msg.value < 0.0004 ether) {
            revert Raffle__NotEnoughETHEntered();
        }
        if (s_raffleState != RaffleState.OPEN) {
            revert Raffle__NotOpen();
        }
        s_players.push(msg.sender);
        emit RaffleEntered(msg.sender);
    }

    function checkUpkeep(
        bytes memory /*checkData*/
    )
        public
        view
        override
        returns (
            bool upkeepNeeded,
            bytes memory /*performData*/
        )
    {
        // if enough LINK
        // if enough players
        // if enough time passed
        // if state is open
        bool isEnoughPlayers = (s_players.length > 0);
        bool isEnoughTimePassed = (block.timestamp - s_latestTimestamp > i_interval);
        bool isRaffleOpen = (s_raffleState == RaffleState.OPEN);
        bool IsEnoughLINK = (address(this).balance > 0);

        upkeepNeeded = isEnoughPlayers && isEnoughTimePassed && isRaffleOpen && IsEnoughLINK;
    }

    function performUpkeep(
        bytes calldata /*performData*/
    ) external override {
        (bool upKeepNeeded, ) = checkUpkeep("");
        if (!upKeepNeeded) {
            revert Raffle__UpkeepNotNeeded(s_players.length, uint256(s_raffleState), address(this).balance);
        }
        s_raffleState = RaffleState.CALCULATING;
        uint256 requestId = i_vrfCoordinator.requestRandomWords(
            i_gasLane,
            i_subscriptionId,
            REQUEST_CONFIRMATIONS,
            i_callbackGasLimit,
            NUM_WORDS
        );
        emit RequestedRandomWinner(requestId);
    }

    function fulfillRandomWords(
        uint256, /*requestId*/
        uint256[] memory randomWords
    ) internal override {
        uint256 indexOfWinner = randomWords[0] % s_players.length;
        address payable recentWinner = payable(s_players[indexOfWinner]);
        s_recentWinner = recentWinner;
        (bool success, ) = recentWinner.call{value: address(this).balance}("");
        if (!success) {
            revert Raffle__TransferFailed();
        }
        s_players = new address[](0);
        s_latestTimestamp = block.timestamp;
        emit WinnerPicked(s_recentWinner);
        s_raffleState = RaffleState.OPEN;
    }

    function getPlayer(uint256 index) external view returns (address) {
        return s_players[index];
    }

    function getNumberOfPlayers() external view returns (uint256) {
        return s_players.length;
    }

    function getVrfCoordinatorV2() external view returns (VRFCoordinatorV2Interface) {
        return i_vrfCoordinator;
    }

    function getGasLane() external view returns (bytes32) {
        return i_gasLane;
    }

    function getSubscriptionId() external view returns (uint64) {
        return i_subscriptionId;
    }

    function getCallbackGasLimit() external view returns (uint32) {
        return i_callbackGasLimit;
    }

    function getRecentWinner() external view returns (address) {
        return s_recentWinner;
    }

    function getInterval() external view returns (uint256) {
        return i_interval;
    }

    function getRaffleState() external view returns (RaffleState) {
        return s_raffleState;
    }

    function getLatestTimestamp() external view returns (uint256) {
        return s_latestTimestamp;
    }
}
