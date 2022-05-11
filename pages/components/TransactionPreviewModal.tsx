import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  Button,
} from '@chakra-ui/react';
import Image from 'next/image';
import { useState } from 'react';

function TransactionPreviewModal({ isOpen, onClose, unsignedTx, handleSubmit}) {
  const [isSubmittingTx, setIsSubmittingTx] = useState(false);

  async function onTxSubmit() {
    setIsSubmittingTx(true)
    // todo - show errors when tx can't be signed or script reduced to false.
    try {
      await handleSubmit();
    } catch(e) {
      alert(e);
    }
    setIsSubmittingTx(false)
    onClose();
  }

  return (
    <>
      <Modal closeOnOverlayClick={false} isOpen={isOpen} onClose={onClose} size="6xl">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Transaction overview</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            <Image src="/utxo-change.svg" width={800} height={600}/>
          </ModalBody>

          <ModalFooter>
            <Button colorScheme='blue' mr={3} onClick={handleSubmit}>
              Sign & Submit
            </Button>
            <Button onClick={onClose} isLoading={isSubmittingTx}>Cancel</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  )
}

export default TransactionPreviewModal;
