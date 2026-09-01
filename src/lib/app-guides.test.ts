import { describe, expect, it } from 'vitest';
import { appGuides, getGuideSteps, searchAppGuides } from './app-guides';

function guide(path: string) {
  const match = appGuides.find((item) => item.path === path);
  if (!match) throw new Error(`Missing guide ${path}`);
  return match;
}

describe('role-aware application guides', () => {
  it('gives viewers review and handoff steps instead of mutation instructions', () => {
    const workerSteps = getGuideSteps(guide('/workers'), 'viewer').join(' ');
    const exceptionSteps = getGuideSteps(guide('/exceptions'), 'viewer').join(' ');

    expect(workerSteps).not.toContain('Use Enroll Face');
    expect(workerSteps).toContain('enrollment operator or administrator');
    expect(exceptionSteps).not.toContain('save the correction');
    expect(exceptionSteps).toContain('authorized supervisor');
  });

  it('keeps operator instructions actionable for authorized roles', () => {
    expect(getGuideSteps(guide('/workers'), 'enrollment').join(' ')).toContain('Use Enroll Face');
    expect(getGuideSteps(guide('/briefing'), 'enrollment').join(' ')).toContain('work attendance exceptions');
    expect(getGuideSteps(guide('/briefing'), 'enrollment').join(' ')).not.toContain('attendance changes to an administrator');
    expect(getGuideSteps(guide('/schedules'), 'admin').join(' ')).toContain('Set the days');
  });
});

describe('guide search', () => {
  it('finds task language and synonyms, not only page titles', () => {
    expect(searchAppGuides('missed clock-out', 'admin').map((item) => item.path)).toContain('/exceptions');
    expect(searchAppGuides('low confidence', 'enrollment').map((item) => item.path)).toContain('/calibration/recognition');
  });

  it('never returns guides unavailable to the current role', () => {
    expect(searchAppGuides('camera', 'viewer').map((item) => item.path)).not.toContain('/enroll');
    expect(searchAppGuides('', 'viewer').map((item) => item.path)).not.toContain('/kiosks');
    expect(searchAppGuides('', 'viewer').map((item) => item.path)).not.toContain('/accounts');
  });

  it('searches the current role-specific steps', () => {
    expect(searchAppGuides('authorized supervisor', 'viewer').map((item) => item.path)).toContain('/exceptions');
  });
});
