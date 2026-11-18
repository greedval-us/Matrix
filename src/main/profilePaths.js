import { mkdirSync } from 'node:fs';
import path from 'node:path';

// The profile name predates the display name and contains existing settings and device keys.
export function configureProfilePaths(app) {
  if (app.commandLine.getSwitchValue('user-data-dir')) return;
  const profile = path.join(app.getPath('appData'), 'matrix');
  mkdirSync(profile, { recursive: true });
  app.setPath('userData', profile);
  app.setPath('sessionData', profile);
}
