import StorageConsentPage from '../../components/StorageConsentPage';

export default function MyStorage() {
  return (
    <StorageConsentPage
      base="/buyer"
      title="My Storage"
      intro="Once you have bought a batch, a manager can offer to hold it nearer you until you take delivery."
      legNote={
        'This is post-sale storage against one of your orders. Rejecting a proposal simply leaves ' +
        'the order open for a different manager to offer against.'
      }
    />
  );
}
