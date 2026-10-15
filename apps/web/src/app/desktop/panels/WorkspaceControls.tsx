import './WorkspaceControls.css';

type Props = {
  showOrderbook: boolean;
  showCommunity: boolean;
  onToggleOrderbook: () => void;
  onToggleCommunity: () => void;
  onOpenPaper: () => void;
};

export function WorkspaceControls({ showOrderbook, showCommunity, onToggleOrderbook, onToggleCommunity, onOpenPaper }: Props) {
  return (
    <div className="workspace-controls" role="group" aria-label="작업 화면">
      <button type="button" aria-pressed={showOrderbook} onClick={onToggleOrderbook}>호가</button>
      <button type="button" aria-pressed={showCommunity} onClick={onToggleCommunity}>커뮤니티</button>
      <button type="button" onClick={onOpenPaper}>모의투자</button>
    </div>
  );
}
