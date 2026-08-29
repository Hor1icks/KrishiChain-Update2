import StorageConsentPage from '../../components/StorageConsentPage';

/** Leg 1 — the farmer's own local storage, before the batch sells. */
export default function StorageRequests() {
  return (
    <StorageConsentPage
      base="/farmer"
      title="Storage Requests"
      intro="A storage manager proposes a unit; nothing is stored until you accept it."
      legNote={
        'This is pre-sale storage: your batch, in your own local warehouse, waiting for a buyer. ' +
        'A batch stays yours until it is awarded.'
      }
    />
  );
}
