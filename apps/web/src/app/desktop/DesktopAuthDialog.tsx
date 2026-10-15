import { useEffect, useRef, type ReactNode } from 'react';
import './DesktopAuthDialog.css';

export function DesktopAuthDialog({ children, onClose, label }: { children: ReactNode; onClose: () => void; label: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return <dialog ref={dialog} className="desktop-auth-dialog" aria-label={label} onCancel={onClose}>{children}</dialog>;
}
