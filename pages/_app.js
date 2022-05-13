import { ChakraProvider, extendTheme } from '@chakra-ui/react';
import '../styles/globals.css';
import Navbar from './components/Navbar';
// 2. Add your color mode config
const config = {
  initialColorMode: 'light',
  useSystemColorMode: false,
};

// 3. extend the theme
const theme = extendTheme({ config });

function MyApp({ Component, pageProps }) {
  return (
    <ChakraProvider theme={theme}>
      <Navbar />
      <Component {...pageProps} />
    </ChakraProvider>
  );
}

export default MyApp;
