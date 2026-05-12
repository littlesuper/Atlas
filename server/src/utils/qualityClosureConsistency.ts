export type QualityClosureConsistencySurfaceInput = {
  name: string;
  content: string;
};

export type QualityClosureConsistencySurface = {
  name: string;
  status: 'READY' | 'ACTION_REQUIRED';
  missingMarkers: string[];
};

export type QualityClosureConsistency = {
  mode: 'QUALITY_CLOSURE_CONSISTENCY';
  status: 'READY' | 'ACTION_REQUIRED';
  generatedAt: string;
  summary: {
    surfaceCount: number;
    readySurfaceCount: number;
    missingMarkerCount: number;
  };
  requiredMarkers: string[];
  surfaces: QualityClosureConsistencySurface[];
  gaps: string[];
};

export function buildQualityClosureConsistency(input: {
  surfaces: QualityClosureConsistencySurfaceInput[];
  requiredMarkers: string[];
  generatedAt?: Date;
}): QualityClosureConsistency {
  const requiredMarkers = normalizeList(input.requiredMarkers);
  const surfaces = input.surfaces
    .map((surface) => ({
      name: surface.name.trim(),
      content: surface.content,
    }))
    .filter((surface) => surface.name.length > 0)
    .map((surface): QualityClosureConsistencySurface => {
      const missingMarkers = requiredMarkers.filter((marker) => !surface.content.includes(marker));

      return {
        name: surface.name,
        status: missingMarkers.length > 0 ? 'ACTION_REQUIRED' : 'READY',
        missingMarkers,
      };
    });
  const gaps = surfaces.flatMap((surface) =>
    surface.missingMarkers.map((marker) => `${surface.name} missing marker: ${marker}`),
  );
  const readySurfaceCount = surfaces.filter((surface) => surface.status === 'READY').length;

  return {
    mode: 'QUALITY_CLOSURE_CONSISTENCY',
    status: gaps.length > 0 ? 'ACTION_REQUIRED' : 'READY',
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    summary: {
      surfaceCount: surfaces.length,
      readySurfaceCount,
      missingMarkerCount: gaps.length,
    },
    requiredMarkers,
    surfaces,
    gaps,
  };
}

function normalizeList(values: string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean);
}
