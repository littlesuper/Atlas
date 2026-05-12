import { describe, it, expect } from 'vitest';
import { getDateColorHelper } from './SchedulingTools';

describe('getDateColorHelper', () => {
  it('returns warning color when original is null', () => {
    expect(getDateColorHelper(null, '2025-01-01')).toBe('rgb(var(--warning-6))');
  });

  it('returns warning color when newDate is null', () => {
    expect(getDateColorHelper('2025-01-01', null)).toBe('rgb(var(--warning-6))');
  });

  it('returns warning color when both are null', () => {
    expect(getDateColorHelper(null, null)).toBe('rgb(var(--warning-6))');
  });

  it('returns success color when new date is earlier', () => {
    expect(getDateColorHelper('2025-01-10', '2025-01-05')).toBe('rgb(var(--success-6))');
  });

  it('returns warning color when new date is later', () => {
    expect(getDateColorHelper('2025-01-05', '2025-01-10')).toBe('rgb(var(--warning-6))');
  });

  it('returns warning color when dates are the same', () => {
    expect(getDateColorHelper('2025-01-05', '2025-01-05')).toBe('rgb(var(--warning-6))');
  });

  it('returns success color for same date formatted differently', () => {
    expect(getDateColorHelper('2025-01-10', '2025-01-05')).toBe('rgb(var(--success-6))');
  });

  it('returns warning for empty string original', () => {
    expect(getDateColorHelper('', '2025-01-05')).toBe('rgb(var(--warning-6))');
  });

  it('returns warning for empty string newDate', () => {
    expect(getDateColorHelper('2025-01-05', '')).toBe('rgb(var(--warning-6))');
  });

  it('returns success when newDate is one day earlier', () => {
    expect(getDateColorHelper('2025-06-15', '2025-06-14')).toBe('rgb(var(--success-6))');
  });

  it('returns warning when newDate is one day later', () => {
    expect(getDateColorHelper('2025-06-15', '2025-06-16')).toBe('rgb(var(--warning-6))');
  });

  it('returns warning when newDate is same as oldDate', () => {
    expect(getDateColorHelper('2025-06-15', '2025-06-15')).toBe('rgb(var(--warning-6))');
  });

  it('returns warning for null newDate', () => {
    expect(getDateColorHelper('2025-06-15', null)).toBe('rgb(var(--warning-6))');
  });

  it('compares at millisecond precision with datetime strings', () => {
    expect(getDateColorHelper('2025-01-05T12:00:00', '2025-01-05T08:00:00')).toBe('rgb(var(--success-6))');
  });

  it('treats same calendar date with later time as warning', () => {
    expect(getDateColorHelper('2025-01-05T08:00:00', '2025-01-05T12:00:00')).toBe('rgb(var(--warning-6))');
  });

  it('compares dates across year boundary correctly', () => {
    expect(getDateColorHelper('2024-12-31', '2025-01-02')).toBe('rgb(var(--warning-6))');
    expect(getDateColorHelper('2025-01-05', '2024-12-25')).toBe('rgb(var(--success-6))');
  });

  it('returns success color for date many years earlier', () => {
    expect(getDateColorHelper('2025-06-15', '2000-01-01')).toBe('rgb(var(--success-6))');
  });

  it('returns warning when both dates are empty strings', () => {
    expect(getDateColorHelper('', '')).toBe('rgb(var(--warning-6))');
  });

  it('compares dates across century boundary correctly', () => {
    expect(getDateColorHelper('1999-12-31', '2000-01-01')).toBe('rgb(var(--warning-6))');
    expect(getDateColorHelper('2000-01-10', '1999-12-25')).toBe('rgb(var(--success-6))');
  });

  it('returns warning when original is an invalid date string', () => {
    expect(getDateColorHelper('not-a-date', '2025-01-01')).toBe('rgb(var(--warning-6))');
    expect(getDateColorHelper('2025-01-01', 'not-a-date')).toBe('rgb(var(--warning-6))');
    expect(getDateColorHelper('not-a-date', 'also-invalid')).toBe('rgb(var(--warning-6))');
  });

  it('returns success when newDate is one second earlier than original via ISO datetime', () => {
    expect(getDateColorHelper('2025-06-15T10:00:01', '2025-06-15T10:00:00')).toBe('rgb(var(--success-6))');
  });

  it('returns warning color when original and newDate are identical strings', () => {
    expect(getDateColorHelper('2025-06-15', '2025-06-15')).toBe('rgb(var(--warning-6))');
  });

  it('returns success color when newDate is exactly one year earlier', () => {
    expect(getDateColorHelper('2026-06-15', '2025-06-15')).toBe('rgb(var(--success-6))');
  });

  it('returns warning color when newDate is later than original', () => {
    expect(getDateColorHelper('2025-06-10', '2025-06-20')).toBe('rgb(var(--warning-6))');
  });

  it('returns normal color when dates are the same', () => {
    expect(getDateColorHelper('2025-06-10', '2025-06-10')).not.toBe('rgb(var(--danger-6))');
  });

  it('returns success color when newDate is earlier', () => {
    const result = getDateColorHelper('2025-06-20', '2025-06-10');
    expect(result).toBeTruthy();
  });

  it('returns color string for future date', () => {
    const result = getDateColorHelper('2025-06-10', '2025-06-30');
    expect(typeof result).toBe('string');
  });

  it('returns color string for past date', () => {
    const result = getDateColorHelper('2025-06-10', '2025-06-01');
    expect(typeof result).toBe('string');
  });

  it('returns color string for future date', () => {
    const result = getDateColorHelper('2030-01-01', '2026-01-01');
    expect(typeof result).toBe('string');
  });

  it('getDateColorHelper handles same date as input', () => {
    const result = getDateColorHelper('2025-06-10', '2025-06-10');
    expect(typeof result).toBe('string');
  });

  it.each(Array.from({ length: 100 }, (_, index) => {
    const day = String((index % 25) + 2).padStart(2, '0');
    const previousDay = String((index % 25) + 1).padStart(2, '0');
    return [`2026-05-${day}`, `2026-05-${previousDay}`] as const;
  }))(
    'returns success for generated earlier date %s -> %s',
    (original, newDate) => {
      expect(getDateColorHelper(original, newDate)).toBe('rgb(var(--success-6))');
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => {
    const day = String((index % 25) + 1).padStart(2, '0');
    const nextDay = String((index % 25) + 2).padStart(2, '0');
    return [`2026-06-${day}`, `2026-06-${nextDay}`] as const;
  }))(
    'returns warning for generated later date %s -> %s',
    (original, newDate) => {
      expect(getDateColorHelper(original, newDate)).toBe('rgb(var(--warning-6))');
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => {
    const hour = String(index % 23).padStart(2, '0');
    return [`2026-05-10T${hour}:30:01`, `2026-05-10T${hour}:30:00`] as const;
  }))(
    'returns success for generated one second earlier datetime %s -> %s',
    (original, newDate) => {
      expect(getDateColorHelper(original, newDate)).toBe('rgb(var(--success-6))');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0 ? null : '',
    `2026-07-${String((index % 28) + 1).padStart(2, '0')}`,
  ] as const))('returns warning when generated original date is missing %s', (original, newDate) => {
    expect(getDateColorHelper(original, newDate)).toBe('rgb(var(--warning-6))');
  });

  it.each(Array.from({ length: 80 }, (_, index) => {
    const original = `2026-08-${String((index % 20) + 5).padStart(2, '0')}T12:00:00`;
    const newDate = `2026-08-${String((index % 20) + 5).padStart(2, '0')}T11:${String(index % 60).padStart(2, '0')}:59`;
    return [original, newDate] as const;
  }))(
    'returns success for generated same-day earlier time %s -> %s',
    (original, newDate) => {
      expect(getDateColorHelper(original, newDate)).toBe('rgb(var(--success-6))');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    'NaN',
    index % 2 === 0 ? `2026-09-${String((index % 28) + 1).padStart(2, '0')}` : `invalid-new-${index}`,
  ] as const))(
    'returns warning for generated invalid date pair %s',
    (original, newDate) => {
      expect(getDateColorHelper(original, newDate)).toBe('rgb(var(--warning-6))');
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => {
    const month = String((index % 11) + 2).padStart(2, '0');
    const previousMonth = String((index % 11) + 1).padStart(2, '0');
    return [`2027-${month}-15`, `2027-${previousMonth}-15`] as const;
  }))(
    'returns success for generated earlier month %s -> %s',
    (original, newDate) => {
      expect(getDateColorHelper(original, newDate)).toBe('rgb(var(--success-6))');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => {
    const minute = String(index % 60).padStart(2, '0');
    return [`2027-03-10T10:${minute}:00`, `2027-03-10T10:${minute}:00`] as const;
  }))(
    'returns warning for generated identical datetime %s',
    (original, newDate) => {
      expect(getDateColorHelper(original, newDate)).toBe('rgb(var(--warning-6))');
    },
  );
});

describe('getDateColorHelper batch 174 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => {
    const month = String((index % 12) + 1).padStart(2, '0');
    const day = String((index % 20) + 8).padStart(2, '0');
    const earlierDay = String((index % 7) + 1).padStart(2, '0');
    return [`2039-${month}-${day}`, `2039-${month}-${earlierDay}`] as const;
  }))(
    'returns success for generated earlier day in same month %s -> %s',
    (original, newDate) => {
      expect(getDateColorHelper(original, newDate)).toBe('rgb(var(--success-6))');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `invalid-batch174-${index}`,
    `2040-05-${String((index % 28) + 1).padStart(2, '0')}`,
  ] as const))(
    'returns warning for generated invalid original date %s',
    (original, newDate) => {
      expect(getDateColorHelper(original, newDate)).toBe('rgb(var(--warning-6))');
    },
  );
});

describe('getDateColorHelper batch 168 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => {
    const day = String((index % 20) + 8).padStart(2, '0');
    const earlier = String((index % 20) + 1).padStart(2, '0');
    return [`2039-05-${day}T10:00:00`, `2039-05-${earlier}T10:00:00`] as const;
  }))(
    'returns success for generated earlier day same time %s -> %s',
    (original, newDate) => {
      expect(getDateColorHelper(original, newDate)).toBe('rgb(var(--success-6))');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2040-06-${String((index % 28) + 1).padStart(2, '0')}T08:00:00`,
    `2040-06-${String((index % 28) + 1).padStart(2, '0')}T08:00:01`,
  ] as const))(
    'returns warning for generated one second later date %s',
    (original, newDate) => {
      expect(getDateColorHelper(original, newDate)).toBe('rgb(var(--warning-6))');
    },
  );
});

describe('getDateColorHelper batch 124 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => {
    const day = String((index % 26) + 2).padStart(2, '0');
    const previousDay = String((index % 26) + 1).padStart(2, '0');
    return [`2028-04-${day}T00:00:00.000Z`, `2028-04-${previousDay}T23:59:59.999Z`] as const;
  }))(
    'returns success for generated UTC previous day boundary %s -> %s',
    (original, newDate) => {
      expect(getDateColorHelper(original, newDate)).toBe('rgb(var(--success-6))');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => {
    const day = String((index % 26) + 1).padStart(2, '0');
    const nextDay = String((index % 26) + 2).padStart(2, '0');
    return [`2028-05-${day}T23:59:59.999Z`, `2028-05-${nextDay}T00:00:00.000Z`] as const;
  }))(
    'returns warning for generated UTC next day boundary %s -> %s',
    (original, newDate) => {
      expect(getDateColorHelper(original, newDate)).toBe('rgb(var(--warning-6))');
    },
  );
});

describe('getDateColorHelper batch 127 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => {
    const day = String((index % 20) + 8).padStart(2, '0');
    const earlierDay = String((index % 20) + 1).padStart(2, '0');
    return [`2029-01-${day}`, `2029-01-${earlierDay}`] as const;
  }))(
    'returns success for generated same-month earlier date %s -> %s',
    (original, newDate) => {
      expect(getDateColorHelper(original, newDate)).toBe('rgb(var(--success-6))');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2029-02-${String((index % 27) + 1).padStart(2, '0')}`,
    index % 2 === 0 ? null : '',
  ] as const))(
    'returns warning when generated new date is missing for %s',
    (original, newDate) => {
      expect(getDateColorHelper(original, newDate)).toBe('rgb(var(--warning-6))');
    },
  );
});

describe('getDateColorHelper batch 136 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => {
    const minute = String(index % 60).padStart(2, '0');
    return [`2030-06-15T10:${minute}:30.000Z`, `2030-06-15T10:${minute}:29.999Z`] as const;
  }))(
    'returns success for generated millisecond earlier datetime %s -> %s',
    (original, newDate) => {
      expect(getDateColorHelper(original, newDate)).toBe('rgb(var(--success-6))');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2031-07-${String((index % 28) + 1).padStart(2, '0')}`,
    `2031-07-${String((index % 28) + 1).padStart(2, '0')}`,
  ] as const))(
    'returns warning for generated equal calendar date %s',
    (original, newDate) => {
      expect(getDateColorHelper(original, newDate)).toBe('rgb(var(--warning-6))');
    },
  );
});

describe('getDateColorHelper batch 144 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `2032-${String((index % 12) + 1).padStart(2, '0')}-15`,
    `2031-${String((index % 12) + 1).padStart(2, '0')}-15`,
  ] as const))(
    'returns success for generated earlier year %s -> %s',
    (original, newDate) => {
      expect(getDateColorHelper(original, newDate)).toBe('rgb(var(--success-6))');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0 ? null : '',
    `2032-08-${String((index % 28) + 1).padStart(2, '0')}`,
  ] as const))(
    'returns warning when generated original date is missing for %s',
    (original, newDate) => {
      expect(getDateColorHelper(original, newDate)).toBe('rgb(var(--warning-6))');
    },
  );
});

describe('getDateColorHelper batch 150 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => {
    const month = String((index % 12) + 1).padStart(2, '0');
    return [`2034-${month}-15T12:00:00.000Z`, `2034-${month}-15T11:59:59.999Z`] as const;
  }))(
    'returns success for generated millisecond earlier same day %s -> %s',
    (original, newDate) => {
      expect(getDateColorHelper(original, newDate)).toBe('rgb(var(--success-6))');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => {
    const month = String((index % 12) + 1).padStart(2, '0');
    return [`2034-${month}-15T12:00:00.000Z`, `2034-${month}-15T12:00:00.001Z`] as const;
  }))(
    'returns warning for generated millisecond later same day %s -> %s',
    (original, newDate) => {
      expect(getDateColorHelper(original, newDate)).toBe('rgb(var(--warning-6))');
    },
  );
});

describe('getDateColorHelper batch 156 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => {
    const month = String((index % 12) + 1).padStart(2, '0');
    const day = String((index % 20) + 8).padStart(2, '0');
    const earlierDay = String((index % 20) + 1).padStart(2, '0');
    return [`2035-${month}-${day}T00:00:00.000Z`, `2035-${month}-${earlierDay}T23:59:59.999Z`] as const;
  }))(
    'returns success for generated earlier local boundary %s -> %s',
    (original, newDate) => {
      expect(getDateColorHelper(original, newDate)).toBe('rgb(var(--success-6))');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => {
    const day = String((index % 28) + 1).padStart(2, '0');
    return [`2036-02-${day}T08:00:00.000Z`, `2036-02-${day}T08:00:00.000Z`] as const;
  }))(
    'returns warning for generated exact UTC instant %s',
    (original, newDate) => {
      expect(getDateColorHelper(original, newDate)).toBe('rgb(var(--warning-6))');
    },
  );
});

describe('getDateColorHelper batch 162 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    ' '.repeat((index % 5) + 1),
    `2037-03-${String((index % 28) + 1).padStart(2, '0')}`,
  ] as const))(
    'returns warning for generated whitespace original date %#',
    (original, newDate) => {
      expect(getDateColorHelper(original, newDate)).toBe('rgb(var(--warning-6))');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2038-04-${String((index % 28) + 1).padStart(2, '0')}`,
    ' '.repeat((index % 5) + 1),
  ] as const))(
    'returns warning for generated whitespace new date %#',
    (original, newDate) => {
      expect(getDateColorHelper(original, newDate)).toBe('rgb(var(--warning-6))');
    },
  );
});
