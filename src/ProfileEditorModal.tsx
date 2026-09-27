import React from 'react';
import { ImagePlus, Pencil, X } from 'lucide-react';
import type { ImagePurpose } from './image';
import type { UserProfile } from './profile';

interface ProfileEditorModalProps {
  profile: UserProfile;
  imageProcessing: ImagePurpose | null;
  onChange: (profile: UserProfile) => void;
  onImageChange: (event: React.ChangeEvent<HTMLInputElement>, purpose: ImagePurpose) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}

export default function ProfileEditorModal({
  profile,
  imageProcessing,
  onChange,
  onImageChange,
  onSubmit,
  onClose,
}: ProfileEditorModalProps) {
  const btnFocus = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-black dark:focus-visible:ring-white focus-visible:ring-offset-2 dark:focus-visible:ring-offset-black';

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <section role="dialog" aria-modal="true" aria-labelledby="edit-profile-title" className="bg-white dark:bg-black border border-gray-200 dark:border-gray-800 rounded-2xl p-6 md:p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto animate-modal">
        <header className="flex items-center justify-between gap-4 mb-6">
          <h3 id="edit-profile-title" className="text-lg font-semibold flex items-center gap-2"><Pencil size={17} /> Editar Perfil</h3>
          <button type="button" aria-label="Fechar edição do perfil" onClick={onClose} className={`text-gray-500 hover:text-black dark:hover:text-white p-2 rounded-lg ${btnFocus}`}><X size={19} /></button>
        </header>

        <form onSubmit={onSubmit} className="space-y-7 text-sm">
          <section className="space-y-4" aria-label="Imagens do perfil">
            <div className="h-36 sm:h-44 bg-gray-100 dark:bg-gray-900 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-800">
              {profile.coverUrl && <img src={profile.coverUrl} className="w-full h-full object-cover" alt="Pré-visualização da capa" />}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr,1.4fr] gap-4 items-center">
              <div className="flex items-center gap-3">
                <div className="w-16 h-16 bg-gray-200 dark:bg-gray-800 rounded-full border-2 border-white dark:border-black flex items-center justify-center font-bold text-xl uppercase overflow-hidden shrink-0">
                  {profile.avatarUrl
                    ? <img src={profile.avatarUrl} className="w-full h-full object-cover" alt="Pré-visualização da fotografia de perfil" />
                    : <span>{profile.name.charAt(0)}</span>}
                </div>
                <span className="text-xs text-gray-500">Fotografia de perfil</span>
              </div>
              <div className="grid gap-3">
                <label className="space-y-1.5">
                  <span className="text-xs font-medium">Imagem de capa</span>
                  <input aria-label="Escolher imagem de capa do dispositivo" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => onImageChange(event, 'cover')} className="block w-full text-xs text-gray-500 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 dark:file:bg-gray-900 file:px-3 file:py-2 file:text-xs file:text-current" />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-medium">Fotografia de perfil</span>
                  <input aria-label="Escolher fotografia de perfil do dispositivo" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => onImageChange(event, 'avatar')} className="block w-full text-xs text-gray-500 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 dark:file:bg-gray-900 file:px-3 file:py-2 file:text-xs file:text-current" />
                </label>
              </div>
            </div>
            {(profile.coverUrl || profile.avatarUrl) && (
              <div className="flex gap-2">
                {profile.coverUrl && <button type="button" onClick={() => onChange({ ...profile, coverUrl: '' })} className={`text-xs text-gray-500 underline rounded-sm ${btnFocus}`}>Remover capa</button>}
                {profile.avatarUrl && <button type="button" onClick={() => onChange({ ...profile, avatarUrl: '' })} className={`text-xs text-gray-500 underline rounded-sm ${btnFocus}`}>Remover fotografia</button>}
              </div>
            )}
            <p className="text-[11px] text-gray-500 flex items-start gap-2"><ImagePlus size={14} className="mt-0.5 shrink-0" /> Escolhe JPG, PNG ou WebP até 10 MB. A imagem é reduzida no teu dispositivo antes de ser guardada no perfil.</p>
            {imageProcessing && <p role="status" className="text-xs text-gray-500">A preparar imagem…</p>}
          </section>

          <section className="space-y-4">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-400 pb-1 border-b border-gray-100 dark:border-gray-900">Informação Básica</h4>
            <input type="text" placeholder="Nome" aria-label="Nome" value={profile.name} onChange={(event) => onChange({ ...profile, name: event.target.value })} required maxLength={100} className="w-full border p-3 rounded-xl bg-transparent border-gray-200 dark:border-gray-800 focus:outline-none focus:border-black dark:focus:border-white" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <input type="text" placeholder="Cargo" aria-label="Cargo" value={profile.role} onChange={(event) => onChange({ ...profile, role: event.target.value })} required maxLength={160} className="w-full border p-3 rounded-xl bg-transparent border-gray-200 dark:border-gray-800 focus:outline-none focus:border-black dark:focus:border-white" />
              <input type="text" placeholder="Empresa / Projeto" aria-label="Empresa / Projeto" value={profile.company || ''} onChange={(event) => onChange({ ...profile, company: event.target.value })} maxLength={160} className="w-full border p-3 rounded-xl bg-transparent border-gray-200 dark:border-gray-800 focus:outline-none focus:border-black dark:focus:border-white" />
            </div>
            <input type="text" placeholder="Localização" aria-label="Localização" value={profile.location} onChange={(event) => onChange({ ...profile, location: event.target.value })} required maxLength={160} className="w-full border p-3 rounded-xl bg-transparent border-gray-200 dark:border-gray-800 focus:outline-none focus:border-black dark:focus:border-white" />
          </section>

          <section className="space-y-4">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-400 pb-1 border-b border-gray-100 dark:border-gray-900">Sobre Ti</h4>
            <div>
              <textarea maxLength={300} placeholder="O teu Pitch curto" aria-label="O teu Pitch curto" value={profile.pitch} onChange={(event) => onChange({ ...profile, pitch: event.target.value })} required className="w-full border p-3 rounded-xl bg-transparent border-gray-200 dark:border-gray-800 h-24 focus:outline-none focus:border-black dark:focus:border-white" />
              <div className="text-right text-[10px] text-gray-400">{profile.pitch.length}/300</div>
            </div>
          </section>

          <section className="space-y-4">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-400 pb-1 border-b border-gray-100 dark:border-gray-900">Objetivos</h4>
            <div>
              <textarea maxLength={300} placeholder="O que procuras no Elo?" aria-label="O que procuras no Elo?" value={profile.lookingFor || ''} onChange={(event) => onChange({ ...profile, lookingFor: event.target.value })} className="w-full border p-3 rounded-xl bg-transparent border-gray-200 dark:border-gray-800 h-24 focus:outline-none focus:border-black dark:focus:border-white" />
              <div className="text-right text-[10px] text-gray-400">{(profile.lookingFor || '').length}/300</div>
            </div>
            <input type="url" placeholder="URL do LinkedIn (HTTPS)" aria-label="URL do LinkedIn" value={profile.linkedinUrl || ''} onChange={(event) => onChange({ ...profile, linkedinUrl: event.target.value })} className="w-full border p-3 rounded-xl bg-transparent border-gray-200 dark:border-gray-800 focus:outline-none focus:border-black dark:focus:border-white" />
          </section>

          <div className="flex justify-end gap-3 border-t border-gray-100 dark:border-gray-900 pt-5">
            <button type="button" onClick={onClose} className={`px-4 py-2.5 border border-gray-200 dark:border-gray-800 rounded-xl text-xs ${btnFocus}`}>Cancelar</button>
            <button type="submit" disabled={imageProcessing !== null} className={`px-5 py-2.5 bg-black text-white dark:bg-white dark:text-black rounded-xl text-xs font-medium disabled:opacity-50 ${btnFocus}`}>Guardar Alterações</button>
          </div>
        </form>
      </section>
    </div>
  );
}
