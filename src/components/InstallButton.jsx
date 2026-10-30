import { useState } from 'react';
import { useInstall } from '../lib/install.js';
import { toast } from '../lib/toast.js';
import { Icon } from './Icon.jsx';
import { Sheet } from './Sheet.jsx';

// Installs Playroom as an app (PWA): home-screen icon, full screen, offline practice.
export function InstallButton() {
  const inst = useInstall();
  const [help, setHelp] = useState(false);
  if (inst.installed || (!inst.canPrompt && !inst.ios)) return null;
  return (
    <>
      <button className="btn btn-quiet btn-sm" onClick={async () => {
        if (inst.canPrompt) { if (await inst.prompt()) toast('Installed. Open Playroom from your home screen.'); }
        else setHelp(true);
      }}>
        <Icon name="download" size={16} /> Install app
      </button>
      <Sheet open={help} onClose={() => setHelp(false)} title="Install on iPhone or iPad">
        <ol className="steps">
          <li>Tap the <b>Share</b> button in Safari’s toolbar.</li>
          <li>Scroll down and tap <b>Add to Home Screen</b>.</li>
          <li>Tap <b>Add</b>. Playroom opens full screen, like any app.</li>
        </ol>
        <button className="btn btn-primary btn-block" onClick={() => setHelp(false)}>Done</button>
      </Sheet>
    </>
  );
}
