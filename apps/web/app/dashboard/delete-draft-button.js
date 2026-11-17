'use client';

import { deleteDraft } from '@/app/actions/weddings';

export default function DeleteDraftButton({ id, title }) {
  return (
    <form
      action={deleteDraft}
      onSubmit={(event) => {
        if (!window.confirm(`Hapus “${title}” beserta semua foto-fotonya? Anda tidak bisa membatalkannya.`)) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button className="button danger small" type="submit">
        Hapus
      </button>
    </form>
  );
}
