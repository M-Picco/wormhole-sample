import {
  CONTRACTS,
  ChainName,
  transferFromEth,
  transferFromEthNative,
  transferFromSolana,
  transferNativeSol,
} from '@certusone/wormhole-sdk';
import {
  Button,
  FormControl,
  MenuItem,
  Select,
  SelectChangeEvent,
  TextField,
  Typography,
} from '@mui/material';
import {
  Connection,
  PublicKey,
  Transaction,
  clusterApiUrl,
} from '@solana/web3.js';
import { BigNumber, ethers } from 'ethers';
import React, { useEffect } from 'react';
import './App.css';
import { hexlify, zeroPad } from 'ethers/lib/utils';

declare global {
  interface Window {
    ethereum: any;
    solana: any;
  }
}

const CHAINS = ['ethereum', 'solana', 'avalanche'];
const CHAIN_IDS = {
  ethereum: 5,
  avalanche: 43113,
};

interface Asset {
  name: string;
  chain: string;
  decimals: number;
  address?: string;
}
const ASSETS: Asset[] = [
  { name: 'ETH', chain: 'ethereum', decimals: 18 },
  { name: 'SOL', chain: 'solana', decimals: 9 },
  { name: 'AVAX', chain: 'avalanche', decimals: 18 },
  {
    name: 'USDC',
    chain: 'avalanche',
    decimals: 6,
    address: '0x5425890298aed601595a70AB815c96711a31Bc65',
  },
];

function App() {
  const [fromChain, setFromChain] = React.useState('');
  const [sender, setSender] = React.useState('');
  const [assetName, setAssetName] = React.useState('');
  const [amount, setAmount] = React.useState('');
  const [receiver, setReceiver] = React.useState('');
  const [toChain, setToChain] = React.useState('');
  const [sendTx, setSendTx] = React.useState('');
  const [balance, setBalance] = React.useState('');

  const onChangeChain = (e: SelectChangeEvent) => {
    setFromChain(e.target.value);
  };
  const onClickConnect = async () => {
    if (!fromChain) return;
    if (sender) {
      setSender('');
      return;
    }

    if (fromChain === 'ethereum' || fromChain === 'avalanche') {
      const provider = new ethers.providers.Web3Provider(
        window.ethereum,
        'any',
      );
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts',
      });
      await provider.send('wallet_switchEthereumChain', [
        { chainId: ethers.utils.hexStripZeros(hexlify(CHAIN_IDS[fromChain])) },
      ]);
      setSender(accounts[0]);
    } else if (fromChain === 'solana') {
      const { publicKey: pk } = await window.solana.connect();
      setSender(pk.toString());
    }
  };
  const onChangeAsset = (e: SelectChangeEvent) => {
    setAssetName(e.target.value);
  };
  const onChangeAmount = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAmount(e.target.value);
  };
  const onReceiverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setReceiver(e.target.value);
  };
  const onChangeToChain = (e: SelectChangeEvent) => {
    setToChain(e.target.value);
  };
  useEffect(() => {
    const asset = ASSETS.find((a) => a.name === assetName);
    if (!asset) return;

    if (fromChain === 'ethereum' || fromChain === 'avalanche') {
      if (asset.address) {
        const provider = new ethers.providers.Web3Provider(
          window.ethereum,
          'any',
        );
        const contract = new ethers.Contract(
          asset.address,
          ['function balanceOf(address owner) view returns (uint256)'],
          provider,
        );
        contract.balanceOf(sender).then((b: any) => {
          setBalance(ethers.utils.formatUnits(b, asset.decimals));
        });
      } else {
        const provider = new ethers.providers.Web3Provider(
          window.ethereum,
          'any',
        );
        const signer = provider.getSigner();
        signer.getBalance().then((balance) => {
          setBalance(ethers.utils.formatUnits(balance, asset.decimals));
        });
      }
    } else if (fromChain === 'solana') {
      const conn = new Connection(clusterApiUrl('devnet'), 'confirmed');
      conn.getBalance(new PublicKey(sender)).then((b) => {
        setBalance(b.toString());
      });
    }
  }, [fromChain, sender, assetName]);
  const onSend = async () => {
    if (!sender || !assetName || !amount || !receiver || !toChain) return;
    const asset = ASSETS.find((a) => a.name === assetName);
    if (!asset) return;

    const parsedAmount = ethers.utils.parseUnits(amount, asset.decimals);

    if (fromChain === 'ethereum' || fromChain === 'avalanche') {
      const provider = new ethers.providers.Web3Provider(
        window.ethereum,
        'any',
      );
      await provider.send('wallet_switchEthereumChain', [
        { chainId: ethers.utils.hexStripZeros(hexlify(CHAIN_IDS[fromChain])) },
      ]);
      const signer = provider.getSigner();
      const tx = asset.address
        ? await transferFromEth(
            CONTRACTS.TESTNET[fromChain].token_bridge,
            signer,
            asset.address,
            parsedAmount,
            toChain as ChainName,
            toChain === 'solana'
              ? new PublicKey(receiver).toBytes()
              : Buffer.from(zeroPad(receiver, 32)),
          )
        : await transferFromEthNative(
            CONTRACTS.TESTNET[fromChain].token_bridge,
            signer,
            parsedAmount,
            toChain as ChainName,
            toChain === 'solana'
              ? new PublicKey(receiver).toBytes()
              : Buffer.from(zeroPad(receiver, 32)),
          );
      setSendTx(tx.transactionHash);
    } else if (fromChain === 'solana') {
      const conn = new Connection(clusterApiUrl('devnet'), 'confirmed');
      const tx: Transaction =
        asset.chain === 'solana'
          ? await transferNativeSol(
              conn,
              CONTRACTS.TESTNET[fromChain].core,
              CONTRACTS.TESTNET[fromChain].token_bridge,
              sender,
              BigInt(amount),
              Buffer.from(receiver.replace('0x', ''), 'hex'),
              toChain as ChainName,
            )
          : await transferFromSolana(
              conn,
              CONTRACTS.TESTNET[fromChain].core,
              CONTRACTS.TESTNET[fromChain].token_bridge,
              sender,
              sender,
              asset.address!,
              BigInt(amount),
              Buffer.from(receiver.replace('0x', ''), 'hex'),
              toChain as ChainName,
            );
      const id = await window.solana.signAndSendTransaction(tx);
      setSendTx(id);
    }
  };

  return (
    <div className="App">
      <div className="container">
        <div className="from">
          <div className="controls">
            <FormControl className="chain-select">
              <Select value={fromChain} label="Chain" onChange={onChangeChain}>
                <MenuItem key={''} value={''}>
                  None
                </MenuItem>
                {CHAINS.map((chain) => (
                  <MenuItem key={chain} value={chain}>
                    {chain.toUpperCase()}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button
              variant="contained"
              disabled={!fromChain}
              onClick={onClickConnect}
            >
              {sender ? 'Disconnect' : 'Connect'}
            </Button>
          </div>
          {sender && (
            <>
              <div className="sender-info controls">
                <Typography className="sender-address">{sender}</Typography>
                <Typography className="sender-balance">{balance}</Typography>
              </div>
              <div className="controls">
                <FormControl className="asset-select">
                  <Select
                    value={assetName}
                    label="Asset"
                    onChange={onChangeAsset}
                  >
                    {ASSETS.filter((a) => a.chain === fromChain).map(
                      (asset) => (
                        <MenuItem key={asset.name} value={asset.name}>
                          {asset.name}
                        </MenuItem>
                      ),
                    )}
                  </Select>
                </FormControl>
                <TextField
                  onChange={onChangeAmount}
                  className="amount-input"
                  variant="outlined"
                  label="Amount"
                ></TextField>
              </div>
            </>
          )}
        </div>
        {assetName && (
          <div className="to">
            <TextField
              className="receiver-input"
              variant="outlined"
              label="Receiver"
              onChange={onReceiverChange}
            ></TextField>
            <FormControl className="chain-select to-chain">
              <Select value={toChain} label="Chain" onChange={onChangeToChain}>
                <MenuItem key={''} value={''}>
                  None
                </MenuItem>
                {CHAINS.filter((chain) => chain !== fromChain).map((chain) => (
                  <MenuItem key={chain} value={chain}>
                    {chain.toUpperCase()}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </div>
        )}
        {receiver && (
          <div className="send">
            <Button variant="outlined" onClick={onSend}>
              Send
            </Button>
            {sendTx && <Typography className="send-tx">{sendTx}</Typography>}
          </div>
        )}
      </div>
      {/* <header className="App-header">
        <img src={logo} className="App-logo" alt="logo" />
        <p>
          Edit <code>src/App.tsx</code> and save to reload.
        </p>
        <a
          className="App-link"
          href="https://reactjs.org"
          target="_blank"
          rel="noopener noreferrer"
        >
          Learn React
        </a>
      </header> */}
    </div>
  );
}

export default App;
