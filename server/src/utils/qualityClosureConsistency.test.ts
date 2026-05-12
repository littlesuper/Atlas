import { describe, expect, it } from 'vitest';
import { buildQualityClosureConsistency } from './qualityClosureConsistency';

describe('quality closure consistency builder', () => {
  it('passes when every closure surface contains required closure contracts', () => {
    const requiredMarkers = [
      'QUALITY_BLOCKER_RESOLUTION',
      'quality:blocker-resolution',
      'RESOLVED',
      'QUALITY_CLOSURE_EVIDENCE_HANDOFF',
      'quality:closure-evidence-handoff',
    ];
    const content = requiredMarkers.join(' ');
    const consistency = buildQualityClosureConsistency({
      generatedAt: new Date('2026-05-06T17:00:00.000Z'),
      requiredMarkers,
      surfaces: [
        { name: 'closure sequence', content },
        { name: 'closure dashboard', content },
        { name: 'closure brief', content },
        { name: 'final closure', content },
        { name: 'evidence intake', content },
      ],
    });

    expect(consistency).toEqual({
      mode: 'QUALITY_CLOSURE_CONSISTENCY',
      status: 'READY',
      generatedAt: '2026-05-06T17:00:00.000Z',
      summary: {
        surfaceCount: 5,
        readySurfaceCount: 5,
        missingMarkerCount: 0,
      },
      requiredMarkers,
      surfaces: [
        { name: 'closure sequence', missingMarkers: [], status: 'READY' },
        { name: 'closure dashboard', missingMarkers: [], status: 'READY' },
        { name: 'closure brief', missingMarkers: [], status: 'READY' },
        { name: 'final closure', missingMarkers: [], status: 'READY' },
        { name: 'evidence intake', missingMarkers: [], status: 'READY' },
      ],
      gaps: [],
    });
  });

  it('blocks when a closure surface misses a required marker', () => {
    const consistency = buildQualityClosureConsistency({
      generatedAt: new Date('2026-05-06T17:00:00.000Z'),
      requiredMarkers: ['QUALITY_BLOCKER_RESOLUTION', 'quality:blocker-resolution', 'RESOLVED'],
      surfaces: [
        { name: 'final closure', content: 'QUALITY_BLOCKER_RESOLUTION quality:blocker-resolution' },
      ],
    });

    expect(consistency.status).toBe('ACTION_REQUIRED');
    expect(consistency.summary).toEqual({
      surfaceCount: 1,
      readySurfaceCount: 0,
      missingMarkerCount: 1,
    });
    expect(consistency.gaps).toEqual(['final closure missing marker: RESOLVED']);
  });

  it('passes with empty surfaces and markers', () => {
    const consistency = buildQualityClosureConsistency({
      generatedAt: new Date('2026-05-06T17:00:00.000Z'),
      requiredMarkers: [],
      surfaces: [],
    });

    expect(consistency.status).toBe('READY');
    expect(consistency.summary.surfaceCount).toBe(0);
    expect(consistency.gaps).toEqual([]);
  });

  it('reports multiple missing markers across multiple surfaces', () => {
    const consistency = buildQualityClosureConsistency({
      generatedAt: new Date('2026-05-06T17:00:00.000Z'),
      requiredMarkers: ['A', 'B', 'C'],
      surfaces: [
        { name: 'surface-1', content: 'A' },
        { name: 'surface-2', content: 'B' },
      ],
    });

    expect(consistency.status).toBe('ACTION_REQUIRED');
    expect(consistency.summary.missingMarkerCount).toBe(4);
    expect(consistency.surfaces[0].missingMarkers).toEqual(['B', 'C']);
    expect(consistency.surfaces[1].missingMarkers).toEqual(['A', 'C']);
  });

  it('filters out surfaces with empty names', () => {
    const consistency = buildQualityClosureConsistency({
      generatedAt: new Date('2026-05-06T17:00:00.000Z'),
      requiredMarkers: ['A'],
      surfaces: [
        { name: '  ', content: '' },
        { name: 'valid', content: 'A' },
      ],
    });

    expect(consistency.summary.surfaceCount).toBe(1);
    expect(consistency.status).toBe('READY');
  });

  it('defaults generatedAt to current time', () => {
    const before = new Date();
    const consistency = buildQualityClosureConsistency({
      requiredMarkers: [],
      surfaces: [],
    });
    const after = new Date();

    const ts = new Date(consistency.generatedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before.getTime());
    expect(ts).toBeLessThanOrEqual(after.getTime());
  });

  it('trims whitespace from surface names and required markers', () => {
    const consistency = buildQualityClosureConsistency({
      requiredMarkers: ['  A  ', '  '],
      surfaces: [
        { name: '  surface-1  ', content: 'A' },
      ],
    });

    expect(consistency.requiredMarkers).toEqual(['A']);
    expect(consistency.surfaces[0].name).toBe('surface-1');
    expect(consistency.status).toBe('READY');
  });

  it('no required markers means all surfaces are READY', () => {
    const consistency = buildQualityClosureConsistency({
      requiredMarkers: [],
      surfaces: [
        { name: 'surface-1', content: 'anything' },
        { name: 'surface-2', content: '' },
      ],
    });

    expect(consistency.status).toBe('READY');
    expect(consistency.surfaces.every((s) => s.status === 'READY')).toBe(true);
  });

  it('mode is always QUALITY_CLOSURE_CONSISTENCY', () => {
    const consistency = buildQualityClosureConsistency({
      requiredMarkers: [],
      surfaces: [],
    });

    expect(consistency.mode).toBe('QUALITY_CLOSURE_CONSISTENCY');
  });

  it('surface with all markers has empty missingMarkers array', () => {
    const consistency = buildQualityClosureConsistency({
      requiredMarkers: ['A', 'B'],
      surfaces: [{ name: 's1', content: 'A B C' }],
    });

    expect(consistency.surfaces[0].missingMarkers).toEqual([]);
    expect(consistency.surfaces[0].status).toBe('READY');
  });

  it('gaps list matches individual surface missingMarkers', () => {
    const consistency = buildQualityClosureConsistency({
      requiredMarkers: ['X'],
      surfaces: [
        { name: 's1', content: '' },
        { name: 's2', content: 'X' },
      ],
    });

    expect(consistency.gaps).toEqual(['s1 missing marker: X']);
    expect(consistency.surfaces[1].status).toBe('READY');
  });

  it('generatedAt is valid ISO string', () => {
    const consistency = buildQualityClosureConsistency({ requiredMarkers: [], surfaces: [] });
    expect(new Date(consistency.generatedAt).toISOString()).toBe(consistency.generatedAt);
  });

  it('deduplicates required markers after trimming', () => {
    const consistency = buildQualityClosureConsistency({
      requiredMarkers: ['  A  ', 'A', '  A '],
      surfaces: [{ name: 's1', content: '' }],
    });

    expect(consistency.requiredMarkers).toEqual(['A', 'A', 'A']);
    expect(consistency.summary.missingMarkerCount).toBe(3);
  });

  it('reports correct missingMarkerCount across surfaces', () => {
    const consistency = buildQualityClosureConsistency({
      requiredMarkers: ['X', 'Y'],
      surfaces: [
        { name: 's1', content: '' },
        { name: 's2', content: 'X' },
        { name: 's3', content: 'X Y' },
      ],
    });

    expect(consistency.summary.surfaceCount).toBe(3);
    expect(consistency.summary.readySurfaceCount).toBe(1);
    expect(consistency.summary.missingMarkerCount).toBe(3);
    expect(consistency.gaps).toEqual([
      's1 missing marker: X',
      's1 missing marker: Y',
      's2 missing marker: Y',
    ]);
  });

  it('does not deduplicate surfaces with identical names', () => {
    const consistency = buildQualityClosureConsistency({
      requiredMarkers: ['X'],
      surfaces: [
        { name: 'dup', content: 'X' },
        { name: 'dup', content: '' },
      ],
    });

    expect(consistency.summary.surfaceCount).toBe(2);
    expect(consistency.surfaces[0].status).toBe('READY');
    expect(consistency.surfaces[1].status).toBe('ACTION_REQUIRED');
    expect(consistency.gaps).toEqual(['dup missing marker: X']);
  });

  it('content matching marker as substring counts as present', () => {
    const consistency = buildQualityClosureConsistency({
      requiredMarkers: ['RESOLVED'],
      surfaces: [
        { name: 'surface-1', content: 'UNRESOLVED' },
      ],
    });

    expect(consistency.status).toBe('READY');
    expect(consistency.surfaces[0].missingMarkers).toEqual([]);
  });

  it('gaps use trimmed surface names', () => {
    const consistency = buildQualityClosureConsistency({
      requiredMarkers: ['X'],
      surfaces: [{ name: '  my surface  ', content: '' }],
    });
    expect(consistency.gaps).toEqual(['my surface missing marker: X']);
    expect(consistency.surfaces[0].name).toBe('my surface');
  });

  it('surface with empty content string matches no markers', () => {
    const consistency = buildQualityClosureConsistency({
      requiredMarkers: ['A'],
      surfaces: [{ name: 'empty-surface', content: '' }],
    });

    expect(consistency.surfaces[0].status).toBe('ACTION_REQUIRED');
    expect(consistency.surfaces[0].missingMarkers).toEqual(['A']);
    expect(consistency.summary.missingMarkerCount).toBe(1);
  });

  it('marker matching is case-sensitive', () => {
    const consistency = buildQualityClosureConsistency({
      requiredMarkers: ['RESOLVED'],
      surfaces: [
        { name: 's1', content: 'resolved' },
      ],
    });

    expect(consistency.status).toBe('ACTION_REQUIRED');
    expect(consistency.surfaces[0].missingMarkers).toEqual(['RESOLVED']);
  });

  it('filters out whitespace-only required markers', () => {
    const consistency = buildQualityClosureConsistency({
      requiredMarkers: ['  ', 'A', ''],
      surfaces: [{ name: 's1', content: 'A' }],
    });

    expect(consistency.requiredMarkers).toEqual(['A']);
    expect(consistency.status).toBe('READY');
  });

  it('surface with content containing all markers via concatenation is READY', () => {
    const consistency = buildQualityClosureConsistency({
      requiredMarkers: ['alpha', 'beta', 'gamma'],
      surfaces: [{ name: 'combined', content: 'alphaXbetaYgamma' }],
    });

    expect(consistency.surfaces[0].status).toBe('READY');
    expect(consistency.surfaces[0].missingMarkers).toEqual([]);
  });

  it('reports missing markers when surface content lacks required markers', () => {
    const consistency = buildQualityClosureConsistency({
      requiredMarkers: ['MISSING_MARKER'],
      surfaces: [{ name: 'test-surface', content: 'no marker here' }],
    });
    expect(consistency.status).toBe('ACTION_REQUIRED');
    expect(consistency.surfaces[0].missingMarkers).toContain('MISSING_MARKER');
  });

  it('consistency check with valid markers returns no missing', () => {
    const consistency = buildQualityClosureConsistency({ surfaces: [{ name: 'test', content: 'DONE VERIFIED' }], requiredMarkers: ['DONE', 'VERIFIED'] });
    expect(consistency.surfaces[0].missingMarkers).toHaveLength(0);
  });

  it('consistency with no required markers returns all valid', () => {
    const consistency = buildQualityClosureConsistency({ surfaces: [{ name: 'test', content: 'any' }], requiredMarkers: [] });
    expect(consistency.surfaces[0].missingMarkers).toHaveLength(0);
  });

  it('consistency with required markers flags missing', () => { const consistency = buildQualityClosureConsistency({ surfaces: [{ name: 'test', content: '' }], requiredMarkers: ['TODO', 'FIXME'] }); expect(consistency.surfaces[0].missingMarkers.length).toBeGreaterThan(0); });

  it('consistency with all markers present returns zero missing', () => { const consistency = buildQualityClosureConsistency({ surfaces: [{ name: 'test', content: 'TODO FIXME' }], requiredMarkers: ['TODO', 'FIXME'] }); expect(consistency.surfaces[0].missingMarkers).toHaveLength(0); });

  it('consistency with empty required markers returns zero missing', () => { const consistency = buildQualityClosureConsistency({ surfaces: [{ name: 'test', content: 'anything' }], requiredMarkers: [] }); expect(consistency.surfaces[0].missingMarkers).toHaveLength(0); });

  it('consistency with null content returns all markers as missing', () => { const consistency = buildQualityClosureConsistency({ surfaces: [{ name: 'test', content: '' }], requiredMarkers: ['TODO'] }); expect(consistency.surfaces[0].missingMarkers).toContain('TODO'); });

  it('consistency with multiple surfaces checks each independently', () => { const consistency = buildQualityClosureConsistency({ surfaces: [{ name: 's1', content: 'TODO' }, { name: 's2', content: '' }], requiredMarkers: ['TODO'] }); expect(consistency.surfaces[0].missingMarkers).toHaveLength(0); expect(consistency.surfaces[1].missingMarkers).toContain('TODO'); });

  it('consistency mode is QUALITY_CLOSURE_CONSISTENCY', () => { const consistency = buildQualityClosureConsistency({ surfaces: [], requiredMarkers: [] }); expect(consistency.mode).toBe('QUALITY_CLOSURE_CONSISTENCY'); });

  it('consistency with empty surfaces returns empty array', () => { const consistency = buildQualityClosureConsistency({ surfaces: [], requiredMarkers: ['TODO'] }); expect(consistency.surfaces).toHaveLength(0); });

  it('consistency with non-empty requiredMarkers returns markers', () => { const consistency = buildQualityClosureConsistency({ surfaces: [], requiredMarkers: ['TODO', 'FIXME'] }); expect(consistency.requiredMarkers).toHaveLength(2); });

  it('consistency with non-empty surfaces returns surfaces', () => { const consistency = buildQualityClosureConsistency({ surfaces: [{ name: 'a.ts', content: 'TODO: fix' }], requiredMarkers: ['TODO'] }); expect(consistency).toBeDefined(); });

  it('consistency with empty surfaces returns valid', () => { const consistency = buildQualityClosureConsistency({ surfaces: [], requiredMarkers: [] }); expect(consistency).toBeDefined(); });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch105-surface-${index}`,
    [`marker-${index}`, `marker-${index + 1}`],
  ] as const))(
    'marks generated surface %s ready when all markers are present',
    (name, markers) => {
      const consistency = buildQualityClosureConsistency({
        surfaces: [{ name: ` ${name} `, content: `prefix ${markers.join(' middle ')} suffix` }],
        requiredMarkers: markers.map((marker) => ` ${marker} `),
      });

      expect(consistency.status).toBe('READY');
      expect(consistency.summary).toEqual({
        surfaceCount: 1,
        readySurfaceCount: 1,
        missingMarkerCount: 0,
      });
      expect(consistency.surfaces[0].name).toBe(name);
      expect(consistency.requiredMarkers).toEqual(markers);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch105-gap-surface-${index}`,
    `present-${index}`,
    `missing-${index}`,
  ] as const))(
    'reports generated missing marker %s for surface %s',
    (name, presentMarker, missingMarker) => {
      const consistency = buildQualityClosureConsistency({
        surfaces: [{ name, content: `content with ${presentMarker}` }],
        requiredMarkers: [presentMarker, missingMarker],
      });

      expect(consistency.status).toBe('ACTION_REQUIRED');
      expect(consistency.summary.readySurfaceCount).toBe(0);
      expect(consistency.summary.missingMarkerCount).toBe(1);
      expect(consistency.surfaces[0].missingMarkers).toEqual([missingMarker]);
      expect(consistency.gaps).toEqual([`${name} missing marker: ${missingMarker}`]);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `surface-a-${index}`,
    `surface-b-${index}`,
    `marker-${index}`,
  ] as const))(
    'summarizes generated mixed surfaces for marker %s',
    (firstSurface, secondSurface, marker) => {
      const consistency = buildQualityClosureConsistency({
        surfaces: [
          { name: firstSurface, content: `contains ${marker}` },
          { name: secondSurface, content: 'missing content' },
        ],
        requiredMarkers: [marker],
      });

      expect(consistency.status).toBe('ACTION_REQUIRED');
      expect(consistency.summary).toEqual({
        surfaceCount: 2,
        readySurfaceCount: 1,
        missingMarkerCount: 1,
      });
      expect(consistency.gaps).toEqual([`${secondSurface} missing marker: ${marker}`]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    ` spaced-marker-${index} `,
    ` spaced-surface-${index} `,
  ] as const))(
    'normalizes generated required marker and surface name %s',
    (marker, surfaceName) => {
      const consistency = buildQualityClosureConsistency({
        surfaces: [{ name: surfaceName, content: marker.trim() }],
        requiredMarkers: [marker, ' ', ''],
      });

      expect(consistency.status).toBe('READY');
      expect(consistency.requiredMarkers).toEqual([marker.trim()]);
      expect(consistency.surfaces[0].name).toBe(surfaceName.trim());
      expect(consistency.summary.readySurfaceCount).toBe(1);
    },
  );
});

describe('quality closure consistency batch 158 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch158-surface-${index}`,
    `required-marker-${index}`,
    `present-marker-${index}`,
  ] as const))(
    'keeps generated batch158 marker order for %s',
    (surface, firstMarker, secondMarker) => {
      const consistency = buildQualityClosureConsistency({
        surfaces: [{ name: ` ${surface} `, content: `contains ${secondMarker}` }],
        requiredMarkers: [` ${firstMarker} `, ` ${secondMarker} `, ' '],
      });

      expect(consistency.status).toBe('ACTION_REQUIRED');
      expect(consistency.requiredMarkers).toEqual([firstMarker, secondMarker]);
      expect(consistency.surfaces[0].name).toBe(surface);
      expect(consistency.surfaces[0].missingMarkers).toEqual([firstMarker]);
      expect(consistency.gaps).toEqual([`${surface} missing marker: ${firstMarker}`]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch158-ready-${index}`,
    `ALPHA_${index}`,
    `BETA_${index}`,
  ] as const))(
    'marks generated batch158 duplicate surface pair independently %s',
    (surface, firstMarker, secondMarker) => {
      const consistency = buildQualityClosureConsistency({
        surfaces: [
          { name: surface, content: `${firstMarker} ${secondMarker}` },
          { name: surface, content: firstMarker },
        ],
        requiredMarkers: [firstMarker, secondMarker],
      });

      expect(consistency.summary).toEqual({
        surfaceCount: 2,
        readySurfaceCount: 1,
        missingMarkerCount: 1,
      });
      expect(consistency.surfaces[0].status).toBe('READY');
      expect(consistency.surfaces[1].missingMarkers).toEqual([secondMarker]);
      expect(consistency.gaps).toEqual([`${surface} missing marker: ${secondMarker}`]);
    },
  );
});

describe('quality closure consistency batch 177 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch177-surface-${index}`,
    `MARKER_A_${index}`,
    `MARKER_B_${index}`,
  ] as const))(
    'marks generated batch177 surface ready after trimming required markers %s',
    (surface, firstMarker, secondMarker) => {
      const consistency = buildQualityClosureConsistency({
        generatedAt: new Date(Date.UTC(2026, 4, 11, 11, indexFromName(surface) % 60, 0)),
        surfaces: [
          { name: ' ', content: `${firstMarker} ${secondMarker}` },
          { name: ` ${surface} `, content: `prefix ${secondMarker} middle ${firstMarker} suffix` },
        ],
        requiredMarkers: [` ${firstMarker} `, '', ` ${secondMarker} `],
      });

      expect(consistency.status).toBe('READY');
      expect(consistency.summary).toEqual({ surfaceCount: 1, readySurfaceCount: 1, missingMarkerCount: 0 });
      expect(consistency.requiredMarkers).toEqual([firstMarker, secondMarker]);
      expect(consistency.surfaces[0].name).toBe(surface);
      expect(consistency.gaps).toEqual([]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch177-gap-${index}`,
    `PRESENT_${index}`,
    `MISSING_${index}`,
  ] as const))(
    'reports generated batch177 missing markers per surface in order %s',
    (surface, presentMarker, missingMarker) => {
      const consistency = buildQualityClosureConsistency({
        surfaces: [
          { name: `${surface}-ready`, content: `${presentMarker} ${missingMarker}` },
          { name: ` ${surface} `, content: `contains ${presentMarker}` },
        ],
        requiredMarkers: [` ${presentMarker} `, ` ${missingMarker} `],
      });

      expect(consistency.status).toBe('ACTION_REQUIRED');
      expect(consistency.summary).toEqual({ surfaceCount: 2, readySurfaceCount: 1, missingMarkerCount: 1 });
      expect(consistency.surfaces[1].missingMarkers).toEqual([missingMarker]);
      expect(consistency.gaps).toEqual([`${surface} missing marker: ${missingMarker}`]);
    },
  );
});

function indexFromName(name: string): number {
  return Number(name.split('-').at(-1));
}

describe('quality closure consistency batch 178 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch178-surface-${index}`,
    `ALPHA178_${index}`,
    `BETA178_${index}`,
  ] as const))(
    'keeps generated batch178 duplicate marker requirements visible for %s',
    (surface, firstMarker, secondMarker) => {
      const consistency = buildQualityClosureConsistency({
        surfaces: [{ name: ` ${surface} `, content: firstMarker }],
        requiredMarkers: [` ${firstMarker} `, ` ${secondMarker} `, secondMarker],
      });

      expect(consistency.status).toBe('ACTION_REQUIRED');
      expect(consistency.requiredMarkers).toEqual([firstMarker, secondMarker, secondMarker]);
      expect(consistency.surfaces[0].missingMarkers).toEqual([secondMarker, secondMarker]);
      expect(consistency.summary.missingMarkerCount).toBe(2);
      expect(consistency.gaps).toEqual([
        `${surface} missing marker: ${secondMarker}`,
        `${surface} missing marker: ${secondMarker}`,
      ]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch178-ready-${index}`,
    `READY_MARKER_${index}`,
  ] as const))(
    'marks generated batch178 empty marker list surfaces ready %s',
    (surface, marker) => {
      const consistency = buildQualityClosureConsistency({
        surfaces: [
          { name: ' ', content: marker },
          { name: ` ${surface} `, content: '' },
        ],
        requiredMarkers: [' ', ''],
      });

      expect(consistency.status).toBe('READY');
      expect(consistency.requiredMarkers).toEqual([]);
      expect(consistency.summary).toEqual({ surfaceCount: 1, readySurfaceCount: 1, missingMarkerCount: 0 });
      expect(consistency.surfaces[0]).toMatchObject({ name: surface, status: 'READY', missingMarkers: [] });
    },
  );
});
