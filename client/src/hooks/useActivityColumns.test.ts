import { describe, it, expect } from 'vitest';
import { formatSeq, dateFmt, COLUMN_WIDTH_MAP, PHASE_COLOR } from './useActivityColumns';

describe('formatSeq', () => {
  it('pads single digit to 3 chars', () => {
    expect(formatSeq(1)).toBe('001');
  });

  it('pads double digit to 3 chars', () => {
    expect(formatSeq(12)).toBe('012');
  });

  it('returns 3+ digit numbers as-is', () => {
    expect(formatSeq(123)).toBe('123');
    expect(formatSeq(999)).toBe('999');
  });

  it('handles zero', () => {
    expect(formatSeq(0)).toBe('000');
  });

  it('handles large numbers', () => {
    expect(formatSeq(1234)).toBe('1234');
    expect(formatSeq(99999)).toBe('99999');
  });

  it('always returns a string', () => {
    expect(typeof formatSeq(5)).toBe('string');
  });

  it('handles negative numbers', () => {
    expect(formatSeq(-1)).toBe('0-1');
  });
});

describe('useActivityColumns helpers batch 174 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => {
    const keys = Object.keys(COLUMN_WIDTH_MAP);
    const key = keys[index % keys.length];
    return [key, COLUMN_WIDTH_MAP[key]] as const;
  }))(
    'generated column width %s remains positive integer',
    (key, width) => {
      expect(width).toBeGreaterThan(0);
      expect(Number.isInteger(width)).toBe(true);
      expect(COLUMN_WIDTH_MAP).toHaveProperty(key);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0 ? null : undefined,
  ] as const))(
    'dateFmt returns placeholder for generated empty value %#',
    (input) => {
      expect(dateFmt(input)).toBe('-');
    },
  );
});

describe('dateFmt', () => {
  it('formats ISO date to YY年MM月DD日', () => {
    expect(dateFmt('2025-01-15')).toBe('25年01月15日');
  });

  it('returns "-" for null', () => {
    expect(dateFmt(null)).toBe('-');
  });

  it('returns "-" for undefined', () => {
    expect(dateFmt(undefined)).toBe('-');
  });

  it('formats date with different year/month', () => {
    expect(dateFmt('2026-12-31')).toBe('26年12月31日');
  });

  it('formats year 2000 correctly', () => {
    expect(dateFmt('2000-06-15')).toBe('00年06月15日');
  });

  it('formats year 2099 correctly', () => {
    expect(dateFmt('2099-03-01')).toBe('99年03月01日');
  });

  it('returns "-" for empty string', () => {
    expect(dateFmt('')).toBe('-');
  });
});

describe('COLUMN_WIDTH_MAP', () => {
  it('has width for all core columns', () => {
    const coreKeys = ['id', 'predecessor', 'phase', 'name', 'type', 'status', 'assignee', 'planDuration', 'planDates', 'actualDates', 'checkItems', 'notes'];
    for (const key of coreKeys) {
      expect(COLUMN_WIDTH_MAP[key]).toBeGreaterThan(0);
    }
  });

  it('all widths are reasonable (30-500)', () => {
    for (const [_key, width] of Object.entries(COLUMN_WIDTH_MAP)) {
      expect(width).toBeGreaterThanOrEqual(30);
      expect(width).toBeLessThanOrEqual(500);
    }
  });

  it('name column is widest text column', () => {
    expect(COLUMN_WIDTH_MAP.name).toBeGreaterThanOrEqual(COLUMN_WIDTH_MAP.type);
    expect(COLUMN_WIDTH_MAP.name).toBeGreaterThanOrEqual(COLUMN_WIDTH_MAP.phase);
  });

  it('id column is narrowest', () => {
    expect(COLUMN_WIDTH_MAP.id).toBeLessThan(COLUMN_WIDTH_MAP.name);
  });
});

describe('PHASE_COLOR', () => {
  it('maps known phases to colors', () => {
    expect(PHASE_COLOR.EVT).toBe('blue');
    expect(PHASE_COLOR.DVT).toBe('green');
    expect(PHASE_COLOR.PVT).toBe('purple');
    expect(PHASE_COLOR.MP).toBe('orange');
  });

  it('has exactly 4 phase colors', () => {
    expect(Object.keys(PHASE_COLOR)).toHaveLength(4);
  });

  it('all values are valid Arco color strings', () => {
    const validColors = ['blue', 'green', 'purple', 'orange', 'red', 'cyan', 'magenta', 'gold', 'lime', 'arcoblue'];
    for (const color of Object.values(PHASE_COLOR)) {
      expect(validColors.some((v) => color.includes(v) || color === v)).toBe(true);
    }
  });

  it('all phase colors are unique', () => {
    const colors = Object.values(PHASE_COLOR);
    expect(new Set(colors).size).toBe(colors.length);
  });

  it('dateFmt formats datetime string with time component', () => {
    expect(dateFmt('2025-01-15T10:30:00')).toBe('25年01月15日');
  });

  it('COLUMN_WIDTH_MAP has exactly 12 core columns', () => {
    expect(Object.keys(COLUMN_WIDTH_MAP)).toHaveLength(12);
  });

  it('PHASE_COLOR has expected keys', () => { expect(Object.keys(PHASE_COLOR).length).toBeGreaterThan(0); });

  it('COLUMN_WIDTH_MAP values are numbers', () => { Object.values(COLUMN_WIDTH_MAP).forEach(v => expect(typeof v).toBe('number')); });

  it('COLUMN_WIDTH_MAP has name key', () => { expect(COLUMN_WIDTH_MAP).toHaveProperty('name'); });

  it('COLUMN_WIDTH_MAP has status key', () => { expect(COLUMN_WIDTH_MAP).toHaveProperty('status'); });

  it('COLUMN_WIDTH_MAP has phase key', () => { expect(COLUMN_WIDTH_MAP).toHaveProperty('phase'); });

  it('COLUMN_WIDTH_MAP has name key', () => { expect(COLUMN_WIDTH_MAP).toHaveProperty('name'); });

  it.each(Array.from({ length: 100 }, (_, index) => [index, String(index).padStart(3, '0')] as const))(
    'formatSeq pads generated index %s',
    (value, expected) => {
      expect(formatSeq(value)).toBe(expected);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => {
    const day = String((index % 28) + 1).padStart(2, '0');
    const month = String((index % 12) + 1).padStart(2, '0');
    return [`2026-${month}-${day}`, `26年${month}月${day}日`] as const;
  }))(
    'dateFmt formats generated date %s',
    (input, expected) => {
      expect(dateFmt(input)).toBe(expected);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [1000 + index, String(1000 + index)] as const))(
    'formatSeq preserves generated four digit index %s',
    (value, expected) => {
      expect(formatSeq(value)).toBe(expected);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => {
    const entries = Object.entries(COLUMN_WIDTH_MAP);
    return entries[index % entries.length];
  }))('column width for generated key %s remains within fixed bounds', (key, width) => {
    expect(COLUMN_WIDTH_MAP[key]).toBe(width);
    expect(width).toBeGreaterThanOrEqual(30);
    expect(width).toBeLessThanOrEqual(500);
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    2000 + index,
    String(2000 + index),
  ] as const))(
    'formatSeq preserves generated large sequence %s',
    (value, expected) => {
      expect(formatSeq(value)).toBe(expected);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => {
    const day = String((index % 28) + 1).padStart(2, '0');
    const month = String((index % 12) + 1).padStart(2, '0');
    return [`2027-${month}-${day}T12:34:56`, `27年${month}月${day}日`] as const;
  }))(
    'dateFmt formats generated datetime %s',
    (input, expected) => {
      expect(dateFmt(input)).toBe(expected);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    -(index + 1),
    String(-(index + 1)).padStart(3, '0'),
  ] as const))(
    'formatSeq pads generated negative index %s',
    (value, expected) => {
      expect(formatSeq(value)).toBe(expected);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => {
    const year = 2028 + (index % 4) * 4;
    return [`${year}-02-29`, String(year).slice(-2)] as const;
  }))(
    'dateFmt formats generated leap day %s',
    (input, yy) => {
      expect(dateFmt(input)).toBe(`${yy}年02月29日`);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    [null, undefined, ''][index % 3],
  ] as const))(
    'dateFmt returns placeholder for generated missing value %s',
    (input) => {
      expect(dateFmt(input)).toBe('-');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    Object.keys(COLUMN_WIDTH_MAP)[index % Object.keys(COLUMN_WIDTH_MAP).length],
  ] as const))(
    'generated column key keeps numeric width %s',
    (key) => {
      expect(typeof COLUMN_WIDTH_MAP[key]).toBe('number');
      expect(COLUMN_WIDTH_MAP[key]).toBeGreaterThan(0);
    },
  );
});

describe('useActivityColumns helpers batch 124 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index + 3000,
    String(index + 3000),
  ] as const))(
    'formatSeq preserves generated four plus digit value %s',
    (value, expected) => {
      expect(formatSeq(value)).toBe(expected);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => {
    const month = String((index % 12) + 1).padStart(2, '0');
    return [`2029-${month}-01T00:00:00.000Z`, `29年${month}月01日`] as const;
  }))(
    'dateFmt formats generated UTC month boundary %s',
    (input, expected) => {
      expect(dateFmt(input)).toBe(expected);
    },
  );
});

describe('useActivityColumns helpers batch 127 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index + 1,
    String(index + 1).padStart(3, '0'),
  ] as const))(
    'formatSeq pads generated positive value %s to fixed width',
    (value, expected) => {
      expect(formatSeq(value)).toBe(expected);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => {
    const year = 2030 + (index % 10);
    const month = String((index % 12) + 1).padStart(2, '0');
    const day = String((index % 27) + 1).padStart(2, '0');
    return [`${year}-${month}-${day}`, `${String(year).slice(-2)}年${month}月${day}日`] as const;
  }))(
    'dateFmt formats generated future local date %s',
    (input, expected) => {
      expect(dateFmt(input)).toBe(expected);
    },
  );
});

describe('useActivityColumns helpers batch 144 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index + 100,
    String(index + 100),
  ] as const))(
    'formatSeq preserves generated three digit value %s',
    (value, expected) => {
      expect(formatSeq(value)).toBe(expected);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => {
    const year = 2035 + (index % 6);
    const day = String((index % 28) + 1).padStart(2, '0');
    return [`${year}-12-${day}T23:59:59`, `${String(year).slice(-2)}年12月${day}日`] as const;
  }))(
    'dateFmt formats generated December datetime %s',
    (input, expected) => {
      expect(dateFmt(input)).toBe(expected);
    },
  );
});

describe('useActivityColumns helpers batch 150 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index + 10,
    String(index + 10).padStart(3, '0'),
  ] as const))(
    'formatSeq pads generated two digit range value %s',
    (value, expected) => {
      expect(formatSeq(value)).toBe(expected);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => {
    const phaseKeys = Object.keys(PHASE_COLOR);
    const phase = phaseKeys[index % phaseKeys.length];
    return [phase, PHASE_COLOR[phase]] as const;
  }))(
    'keeps generated phase color mapping %s',
    (phase, color) => {
      expect(PHASE_COLOR[phase]).toBe(color);
      expect(Object.values(PHASE_COLOR).filter((value) => value === color)).toHaveLength(1);
    },
  );
});

describe('useActivityColumns helpers batch 156 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => {
    const value = -(index + 10);
    return [value, String(value)] as const;
  }))(
    'formatSeq preserves generated multi-digit negative value %s',
    (value, expected) => {
      expect(formatSeq(value)).toBe(expected);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => {
    const year = 2040 + (index % 5);
    const month = String((index % 12) + 1).padStart(2, '0');
    const day = String((index % 28) + 1).padStart(2, '0');
    return [`${year}-${month}-${day}T12:00:00.000Z`, `${String(year).slice(-2)}年${month}月${day}日`] as const;
  }))(
    'dateFmt formats generated UTC noon date %s',
    (input, expected) => {
      expect(dateFmt(input)).toBe(expected);
    },
  );
});

describe('useActivityColumns helpers batch 162 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => {
    const value = -((index % 9) + 1);
    return [value, `0${value}`] as const;
  }))(
    'formatSeq pads generated single digit negative value %s',
    (value, expected) => {
      expect(formatSeq(value)).toBe(expected);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `not-a-date-batch162-${index}`,
  ] as const))(
    'dateFmt returns invalid marker for generated invalid truthy date %s',
    (input) => {
      expect(dateFmt(input)).toBe('Invalid Date');
    },
  );
});

describe('useActivityColumns helpers batch 168 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index,
    String(index).padStart(3, '0'),
  ] as const))(
    'formatSeq pads generated zero-based value %s',
    (value, expected) => {
      expect(formatSeq(value)).toBe(expected);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => {
    const year = 2045 + (index % 5);
    const month = String((index % 12) + 1).padStart(2, '0');
    const day = String((index % 28) + 1).padStart(2, '0');
    return [`${year}-${month}-${day}T23:59:59`, `${String(year).slice(-2)}年${month}月${day}日`] as const;
  }))(
    'dateFmt formats generated end of day datetime %s',
    (input, expected) => {
      expect(dateFmt(input)).toBe(expected);
    },
  );
});
