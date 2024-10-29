/*
# Wormhole Labs TypeScript Interview

Write a small TypeScript CLI tool that acts as a basic Solana wallet.

## Requirements

- Provides a basic CLI interface for core functionality:
    - Generate a new Solana keypair and store it
    - Print your public wallet address
    - Print your SOL balance
    - Send SOL to a given address
    - Send SPL tokens to a given address (stretch goal)
- Acceptance criteria:
    - Provide your CLI tool source code, as well as an NPM package .tgz (using `npm pack`)
    - Provide documentation on how to use it

Please don’t spend more than four hours on this! While working, take note of what came to mind that you would want to tackle next. Be prepared to discuss that.

## Notes
- You will want to use Solana-Web3.js: https://solana.com/docs/clients/javascript
- For the purposes of the exercise, please use Solana devnet or a [local validator](https://docs.solanalabs.com/cli/examples/test-validator)
    - You can get free devnet SOL here: https://faucet.solana.com/
    - You can query Solana devnet on this RPC node: [https://api.devnet.solana.com](https://api.devnet.solana.com/)
    - You can find Solana RPC documentation here: https://solana.com/docs/rpc
*/

const argv = require('minimist')(process.argv.slice(2))
const solana = require("@solana/web3.js")
const spl = require("@solana/spl-token")

import fs from 'fs'

const network = 'devnet'
const confirmation = 'confirmed'

const readKey = (name: string) => {
  const keyFilePath = `./keys/${name}`
  if (!fs.existsSync(keyFilePath)) {
    throw new Error(`Keypair ${name} does not exist`)
  }

  const secret = new Uint8Array(fs.readFileSync(keyFilePath).toString().split(',').map(Number))
  const keypair = solana.Keypair.fromSecretKey(secret)
  return keypair
}

const readMintAddress = (name: string) => {
  if (!fs.existsSync(`./mints/${name}`)) {
    throw new Error('Mint does not exist')
  }

  const secret = fs.readFileSync(`./mints/${name}`)
  const publicAddress = new solana.PublicKey(secret.toString())
  return publicAddress
}

const generateKeypair = () => {
  const name = argv._[1]
  if (!name) {
    throw new Error('Usage: generate <name>')
  }
  const keyFilePath = `./keys/${name}`
  if (fs.existsSync(keyFilePath)) {
    console.log(`Keypair already exists, move or rename ${keyFilePath} then try again`)
    return 1
  }

  let keypair = solana.Keypair.generate()
  fs.writeFileSync(keyFilePath, keypair.secretKey.toString())
  console.log('Saved new secret key to', keyFilePath)
}

const getAddress = () => {
  const name = argv._[1]
  if (!name) {
    throw new Error('Usage: address <name>')
  }
  const address = readKey(name).publicKey.toString()
  console.log(address)
}

const getBalance = async () => {
  const name = argv._[1]
  if (!name) {
    throw new Error('Usage: balance <name>')
  }
  const keypair = readKey(name)
  const connection = new solana.Connection(solana.clusterApiUrl(network), confirmation);
  const balance = await connection.getBalance(keypair.publicKey)
  console.log('Current balance:', balance / solana.LAMPORTS_PER_SOL, 'SOL')
}

const sendSol = async () => {
  const name = argv._[1]

  const destination = argv._[2]
  const amount = argv._[3]

  if (!destination || !amount || !name) {
    throw new Error('Usage: send <name> <destination> <amount>')
  }

  const dest = fs.existsSync(`./keys/${destination}`) ? readKey(destination).publicKey.toBase58() : destination

  const keypair = readKey(name)
  const connection = new solana.Connection(solana.clusterApiUrl(network), confirmation)
  const transaction = new solana.Transaction().add(solana.SystemProgram.transfer({
    fromPubkey: keypair.publicKey,
    toPubkey: dest,
    lamports: amount * solana.LAMPORTS_PER_SOL,
  }))
  await solana.sendAndConfirmTransaction(connection, transaction, [keypair])
  console.log('Sent', amount, 'SOL to', destination)
}

const airdrop = async () => {
  const name = argv._[1]
  if (!name) {
    throw new Error('Usage: airdrop <name>')
  }
  const keypair = readKey(name)
  const connection = new solana.Connection(solana.clusterApiUrl(network), confirmation)

  let airdropSignature = await connection.requestAirdrop(
    keypair.publicKey,
    solana.LAMPORTS_PER_SOL,
  )

  console.log(' Airdrop requested...')
  await connection.confirmTransaction({ signature: airdropSignature });
  console.log('Airdrop confirmed')
}

const mint = async () => {
  const minter = argv._[1]
  const amount = argv._[2]
  const name = argv._[3]

  if (!minter || !amount || !name) {
    throw new Error('Usage: mint <minter> <amount> <name>')
  } else if (fs.existsSync(`./mints/${name}`)) {
    throw new Error('Mint already exists, try again with a different name')
  }

  const keypair = readKey(minter)
  const connection = new solana.Connection(solana.clusterApiUrl(network), confirmation)

  const mint = await spl.createMint(
    connection,
    keypair,
    keypair.publicKey,
    null,
    9,
  )

  const tokenAccount = await spl.getOrCreateAssociatedTokenAccount(
    connection,
    keypair,
    mint,
    keypair.publicKey,
  )

  await spl.mintTo(
    connection,
    keypair,
    mint,
    tokenAccount.address,
    keypair.publicKey,
    111111111111,
    [],
  )


  const tokenAddress = mint.toBase58()
  fs.writeFileSync(`./mints/${name}`, tokenAddress)
  console.log('Minted', amount, name, 'to', tokenAddress)
}

const sendSpl = async () => {
  const sender = argv._[1]
  const destination = argv._[2]
  const amount = argv._[3]
  const name = argv._[4]

  if (!sender || !destination || !amount || !name) {
    throw new Error('Usage: sendSpl <sender> <destination> <amount> <name>')
  }

  const connection = new solana.Connection(solana.clusterApiUrl(network), confirmation)

  const dest = fs.existsSync(`./keys/${destination}`) ?
    new solana.PublicKey(readKey(destination).publicKey.toBase58()) :
    new solana.PublicKey(destination)

  const keypair = readKey(sender)
  const mint = readMintAddress(name)

  const fromTokenAccount = await spl.getOrCreateAssociatedTokenAccount(
      connection,
      keypair,
      mint,
      keypair.publicKey
  )

  const toTokenAccount = await spl.getOrCreateAssociatedTokenAccount(
    connection,
    keypair,
    mint,
    dest
  )

  const signature = await spl.transfer(
      connection,
      keypair,
      fromTokenAccount.address,
      toTokenAccount.address,
      keypair.publicKey,
      amount * solana.LAMPORTS_PER_SOL
  );

  console.log('transfer tx:', signature)
  console.log('Sent', amount, name, 'to', destination)
}

switch (argv._[0]) {
  case 'generate':
    generateKeypair()
    break
  case 'address':
    getAddress()
    break
  case 'balance':
    getBalance()
    break
  case 'send':
    sendSol()
    break
  case 'airdrop':
    airdrop()
    break
  case 'mint':
    mint()
    break
  case 'sendSpl':
    sendSpl()
    break
  default:
    console.log('Unrecognized command: ', argv._[0], ' try one of: generate, address, balance, send, airdrop, mint, sendSpl')
}
