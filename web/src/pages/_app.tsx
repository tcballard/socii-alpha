import type { AppProps } from 'next/app';
import Nav from '../components/Nav';
import '../styles/globals.css';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <div className="nav">
        <div className="brand">Socii</div>
        <Nav />
      </div>
      <div className="container">
        <Component {...pageProps} />
      </div>
    </>
  );
}


