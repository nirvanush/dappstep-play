import Head from 'next/head'
import Image from 'next/image'
import styles from '../styles/Home.module.css'

export default function Home() {
  return (
    <div className={styles.container}>
      <Head>
        <title>Dappstep Play</title>
        <meta name="description" content="Dappstep Play" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className={styles.main}>
        <h1 className={styles.title}>
          Welcome to <a href="https://dappstep.com">dappstep!</a>
        </h1>

        <p className={styles.description}>
          Interactive tutorials for javascript dApp development on Ergo Platform{' '}
          <code className={styles.code}></code>
        </p>

        <div className={styles.grid}>
          <a href="/pin-lock-contract" className={styles.card}>
            <h2>Pin Lock Contract &rarr;</h2>
            <p>dApp based on ergoscript-by-example pin lock contract</p>
          </a>
        </div>
      </main>

      <footer className={styles.footer}>
        <a
          href="https://dappstep.com"
          target="_blank"
          rel="noopener noreferrer"
        >
          Powered by{' '}
          <span className={styles.logo}>
            <Image src="/vercel.svg" alt="Vercel Logo" width={72} height={16} />
          </span>
        </a>
      </footer>
    </div>
  )
}
