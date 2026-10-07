// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title LanternGate
/// @notice Lantern's mint gate on an EVM chain: an ERC-20 whose only mint path is
///         gated by a fresh, attestor-signed per-chain cap. The attestor gives each
///         chain (Solana, Sepolia, Robinhood) its own allocation with
///         sum(caps) <= backed shares, so chains can't jointly over-mint even if
///         they mint at the same moment. 6 decimals: raw units match Solana's.
contract LanternGate {
    // ---------- ERC-20 ----------
    string public name;
    string public constant symbol = "xAAPL";
    uint8 public constant decimals = 6;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    // ---------- Gate ----------
    bytes32 public constant DOMAIN = keccak256("LANTERN_EVM_ATTEST01");
    uint64 public constant MAX_FUTURE_SKEW = 60;

    address public immutable admin;
    address public attestor;
    /// address(0) = open minting (demo mode); otherwise only this address may mint.
    address public minter;
    uint64 public immutable stalenessSecs;

    uint256 public cap;
    uint64 public observedAt;
    uint64 public nonce;

    event Attested(uint64 nonce, uint64 observedAt, uint256 cap, uint256 supply, bool paused);
    event Minted(address indexed by, address indexed to, uint256 amount, uint256 newSupply, uint256 cap);
    event MinterChanged(address minter);
    event AttestorChanged(address attestor);

    error Unauthorized();
    error InvalidSignature();
    error NonceReplay();
    error TimestampRegression();
    error FutureTimestamp();
    error StaleAttestation();
    error ExceedsBacking();
    error InsufficientBalance();
    error InsufficientAllowance();

    constructor(string memory name_, address attestor_, uint64 stalenessSecs_) {
        name = name_;
        admin = msg.sender;
        attestor = attestor_;
        stalenessSecs = stalenessSecs_;
    }

    /// @notice Store a new attested cap for this chain. Callable by anyone (a relayer
    ///         or CRE); trust comes from the attestor's signature over
    ///         (DOMAIN, chainId, this contract, nonce, observedAt, cap).
    function submitAttestation(uint256 cap_, uint64 nonce_, uint64 observedAt_, bytes calldata sig) external {
        if (nonce_ <= nonce) revert NonceReplay();
        if (observedAt_ <= observedAt) revert TimestampRegression();
        if (observedAt_ > block.timestamp + MAX_FUTURE_SKEW) revert FutureTimestamp();
        bytes32 digest = keccak256(abi.encode(DOMAIN, block.chainid, address(this), nonce_, observedAt_, cap_));
        if (_recover(_ethSigned(digest), sig) != attestor) revert InvalidSignature();
        cap = cap_;
        nonce = nonce_;
        observedAt = observedAt_;
        emit Attested(nonce_, observedAt_, cap_, totalSupply, totalSupply > cap_);
    }

    /// @notice Mint within the attested cap. Fails closed on a stale attestation;
    ///         supply above the cap (shortfall) blocks every mint (auto-pause).
    function mint(address to, uint256 amount) external {
        if (minter != address(0) && msg.sender != minter) revert Unauthorized();
        if (nonce == 0 || block.timestamp > uint256(observedAt) + stalenessSecs) revert StaleAttestation();
        if (totalSupply + amount > cap) revert ExceedsBacking();
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
        emit Minted(msg.sender, to, amount, totalSupply, cap);
    }

    function setMinter(address minter_) external {
        if (msg.sender != admin) revert Unauthorized();
        minter = minter_;
        emit MinterChanged(minter_);
    }

    function setAttestor(address attestor_) external {
        if (msg.sender != admin) revert Unauthorized();
        attestor = attestor_;
        emit AttestorChanged(attestor_);
    }

    function isFresh() external view returns (bool) {
        return nonce > 0 && block.timestamp <= uint256(observedAt) + stalenessSecs;
    }

    // ---------- ERC-20 transfers ----------
    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            if (allowed < amount) revert InsufficientAllowance();
            allowance[from][msg.sender] = allowed - amount;
        }
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        if (balanceOf[from] < amount) revert InsufficientBalance();
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }

    // ---------- ECDSA ----------
    function _ethSigned(bytes32 h) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", h));
    }

    function _recover(bytes32 h, bytes calldata sig) internal pure returns (address) {
        if (sig.length != 65) revert InvalidSignature();
        bytes32 r = bytes32(sig[0:32]);
        bytes32 s = bytes32(sig[32:64]);
        uint8 v = uint8(sig[64]);
        // Reject malleable high-s signatures.
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) revert InvalidSignature();
        address signer = ecrecover(h, v, r, s);
        if (signer == address(0)) revert InvalidSignature();
        return signer;
    }
}
