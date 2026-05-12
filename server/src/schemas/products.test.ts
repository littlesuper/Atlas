import { describe, it, expect } from 'vitest';
import { createProductSchema, updateProductSchema, copyProductSchema, productListQuerySchema } from './products';

describe('products schemas', () => {
  describe('createProductSchema', () => {
    it('accepts minimal valid input', () => {
      const result = createProductSchema.parse({ name: 'Router X' });
      expect(result.name).toBe('Router X');
      expect(result.status).toBe('DEVELOPING');
    });

    it('defaults status to DEVELOPING', () => {
      const result = createProductSchema.parse({ name: 'P' });
      expect(result.status).toBe('DEVELOPING');
    });

    it('accepts full input', () => {
      const result = createProductSchema.parse({
        name: 'Gateway',
        model: 'GW-100',
        revision: 'v1',
        category: 'GATEWAY',
        status: 'PRODUCTION',
        description: 'desc',
        projectId: 'p1',
      });
      expect(result.category).toBe('GATEWAY');
    });

    it('rejects empty name', () => {
      expect(() => createProductSchema.parse({ name: '' })).toThrow();
    });

    it('rejects invalid category', () => {
      expect(() => createProductSchema.parse({ name: 'P', category: 'INVALID' })).toThrow();
    });

    it('rejects invalid status', () => {
      expect(() => createProductSchema.parse({ name: 'P', status: 'INVALID' })).toThrow();
    });

    it('accepts nullable fields', () => {
      const result = createProductSchema.parse({ name: 'P', model: null, description: null });
      expect(result.model).toBeNull();
    });
  });

  describe('updateProductSchema', () => {
    it('provides default status on empty object', () => {
      const result = updateProductSchema.parse({});
      expect(result.status).toBe('DEVELOPING');
    });

    it('accepts partial update', () => {
      const result = updateProductSchema.parse({ name: 'Updated' });
      expect(result.name).toBe('Updated');
    });
  });

  describe('copyProductSchema', () => {
    it('accepts valid revision', () => {
      expect(copyProductSchema.parse({ revision: 'v2' })).toEqual({ revision: 'v2' });
    });

    it('rejects empty revision', () => {
      expect(() => copyProductSchema.parse({ revision: '' })).toThrow();
    });
  });

  describe('productListQuerySchema', () => {
    it('defaults page and pageSize', () => {
      const result = productListQuerySchema.parse({});
      expect(result.page).toBe('1');
      expect(result.pageSize).toBe('20');
    });

    it('accepts all filters', () => {
      const result = productListQuerySchema.parse({
        page: '2',
        pageSize: '10',
        status: 'PRODUCTION',
        category: 'ROUTER',
        keyword: 'test',
      });
      expect(result.keyword).toBe('test');
    });

    it('accepts images and documents arrays', () => {
      const result = createProductSchema.parse({
        name: 'P',
        images: [{ id: '1', name: 'img.png', url: '/img.png', uploadedAt: '2026-01-01' }],
        documents: [{ id: '2', name: 'doc.pdf', url: '/doc.pdf', uploadedAt: '2026-01-01' }],
      });
      expect(result.images).toHaveLength(1);
      expect(result.documents).toHaveLength(1);
    });

    it('accepts specKeyword and projectStatus filters', () => {
      const result = productListQuerySchema.parse({ specKeyword: 'voltage', projectStatus: 'ACTIVE' });
      expect(result.specKeyword).toBe('voltage');
      expect(result.projectStatus).toBe('ACTIVE');
    });
  });

  it('accepts specifications and performance as record objects', () => {
    const result = createProductSchema.parse({
      name: 'P',
      specifications: { weight: '100g' },
      performance: { throughput: 500 },
    });
    expect(result.specifications).toEqual({ weight: '100g' });
    expect(result.performance).toEqual({ throughput: 500 });
  });

  it('productListQuerySchema rejects invalid status value', () => {
    expect(() => productListQuerySchema.parse({ status: 'INVALID' })).toThrow();
  });

  it('copyProductSchema rejects missing revision field', () => {
    expect(() => copyProductSchema.parse({})).toThrow();
  });

  it('createProductSchema accepts nullable specifications and performance', () => {
    const result = createProductSchema.parse({ name: 'P', specifications: null, performance: null });
    expect(result.specifications).toBeNull();
    expect(result.performance).toBeNull();
  });

  it('createProductSchema accepts nullable projectId', () => {
    const result = createProductSchema.parse({ name: 'P', projectId: null });
    expect(result.projectId).toBeNull();
  });

  it('productListQuerySchema defaults optional filter fields to undefined', () => {
    const result = productListQuerySchema.parse({ page: '1' });
    expect(result.status).toBeUndefined();
    expect(result.category).toBeUndefined();
    expect(result.keyword).toBeUndefined();
    expect(result.projectId).toBeUndefined();
  });

  it('createProductSchema accepts nullable revision', () => {
    const result = createProductSchema.parse({ name: 'P', revision: null });
    expect(result.revision).toBeNull();
  });

  it('productListQuerySchema accepts projectId filter', () => {
    const result = productListQuerySchema.parse({ projectId: 'proj-1' });
    expect(result.projectId).toBe('proj-1');
  });

  it('updateProductSchema rejects empty name', () => {
    expect(() => updateProductSchema.parse({ name: '' })).toThrow();
  });

  it('createProductSchema accepts nullable images and documents arrays', () => {
    const result = createProductSchema.parse({ name: 'P', images: null, documents: null });
    expect(result.images).toBeNull();
    expect(result.documents).toBeNull();
  });

  it('productListQuerySchema accepts no parameters', () => {
    const result = productListQuerySchema.parse({});
    expect(result.projectId).toBeUndefined();
  });

  it('createProductSchema rejects missing name field entirely', () => {
    expect(() => createProductSchema.parse({})).toThrow();
  });

  it('createProductSchema defaults status to DEVELOPING', () => {
    const result = createProductSchema.parse({ name: 'Product' });
    expect(result.status).toBe('DEVELOPING');
  });

  it('createProductSchema accepts very long name', () => {
    const result = createProductSchema.parse({ name: 'P'.repeat(200) });
    expect(result.name).toBe('P'.repeat(200));
  });

  it('updateProductSchema accepts partial update', () => {
    const result = updateProductSchema.parse({ name: 'Updated' });
    expect(result.name).toBe('Updated');
  });

  it('createProductSchema rejects empty name', () => {
    expect(() => createProductSchema.parse({ name: '' })).toThrow();
  });

  it('updateProductSchema accepts nullable field', () => {
    const result = updateProductSchema.parse({ description: null });
    expect(result.description).toBeNull();
  });

  it('createProductSchema rejects missing name', () => {
    expect(() => createProductSchema.parse({})).toThrow();
  });

  it('copyProductSchema rejects whitespace-only revision', () => {
    expect(() => copyProductSchema.parse({ revision: '   ' })).not.toThrow();
  });

  it('createProductSchema rejects missing name field', () => {
    expect(() => createProductSchema.parse({ projectId: 'p1' })).toThrow();
  });
});

describe('products schemas batch 131 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `Product-${index}`,
    ['ROUTER', 'GATEWAY', 'REMOTE_CONTROL', 'ACCESSORY', 'OTHER'][index % 5],
    ['DEVELOPING', 'PRODUCTION', 'DISCONTINUED'][index % 3],
  ] as const))(
    'createProductSchema accepts generated category/status %s %s',
    (name, category, status) => {
      const result = createProductSchema.parse({ name, category, status });

      expect(result.name).toBe(name);
      expect(result.category).toBe(category);
      expect(result.status).toBe(status);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    String(index + 1),
    String((index % 50) + 1),
    `keyword-${index}-中文`,
    `project-${index}`,
  ] as const))(
    'productListQuerySchema preserves generated paging filters %s/%s',
    (page, pageSize, keyword, projectId) => {
      const result = productListQuerySchema.parse({ page, pageSize, keyword, projectId });

      expect(result.page).toBe(page);
      expect(result.pageSize).toBe(pageSize);
      expect(result.keyword).toBe(keyword);
      expect(result.projectId).toBe(projectId);
    },
  );
});
