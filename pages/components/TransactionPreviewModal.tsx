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

function TransactionPreviewModal({
  isOpen,
  onClose,
  unsignedTx,
  handleSubmit,
  feedback = null,
  txHash = null,
  isSubmitting
}) {
  return (
    <>
      <Modal closeOnOverlayClick={false} isOpen={isOpen} onClose={onClose} size="6xl">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Transaction overview</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            <div style={{border: '1px gray solid', maxHeight: 550}}>
              <Image src="/utxo-change.svg" width={1000} height={500}/>
            </div>
            {feedback && (<div>{feedback}</div>)}
            {txHash && <>Success! <a style={{textDecoration: 'underline'}}
              href={`https://explorer.ergoplatform.com/en/transactions/${txHash}`}
              target="_blank"
              rel='noreferrer'>{txHash}</a></>}
          </ModalBody>

          <ModalFooter>
            <Button colorScheme="blue" mr={3} onClick={handleSubmit} isLoading={isSubmitting} disabled={txHash}>
              Sign & Submit
            </Button>
            <Button onClick={onClose}>
              Close
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}

export default TransactionPreviewModal;
