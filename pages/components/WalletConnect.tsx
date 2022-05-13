import { Menu, MenuButton, MenuList, MenuItem, Button, MenuDivider, Link } from '@chakra-ui/react';
import { useEffect, useState } from 'react';
import { ExternalLinkIcon } from '@chakra-ui/icons';

function shortenAddress(str: string, chars: number=10) {
  return '...' + str.substr(str.length - chars)
} 

const USER_ADDRESS = 'user-address';

export default function WalletConnect() {
  const [userAddress, setUserAddress] = useState(null);

  const connectedProps = { bg: 'green.600', color: 'white' };

  async function connectWallet() {
    if (ergoConnector && ergoConnector.nautilus) {
      await ergoConnector.nautilus.connect();
      const address = await ergo.get_change_address();

      // the easiest way to share it with other components. The better way would be to use React state.
      localStorage.setItem(USER_ADDRESS, address);
      setUserAddress(address);
    }
  }

  function howTo() {
    
  }

  useEffect(() => {
    connectWallet()
  }, [])

  return (
    <Menu>
      <MenuButton
        as={Button}
        cursor={'pointer'}
        maxW={200}
        {...(!!userAddress ? connectedProps : {})}
        style={{overflow: 'hidden'}}
        minW={0}>
        {userAddress ?  shortenAddress(userAddress, 10): 'Connect Wallet'}
      </MenuButton>
      <MenuList>
        <MenuItem onClick={connectWallet}>Nautilus</MenuItem>
        <MenuDivider />
        <MenuItem onClick={howTo} icon={<ExternalLinkIcon />} as={Link} minH="48px" href="https://www.dappstep.com/blog" isExternal>
         How to implement it?
        </MenuItem>
      </MenuList>
    </Menu>
  )
}
