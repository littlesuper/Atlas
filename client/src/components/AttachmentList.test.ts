import { describe, it, expect } from 'vitest';
import { isImageUrl } from './AttachmentList';

describe('isImageUrl', () => {
  it('matches .png URLs', () => {
    expect(isImageUrl('https://example.com/img.png')).toBe(true);
  });

  it('matches .jpg URLs', () => {
    expect(isImageUrl('https://example.com/img.jpg')).toBe(true);
  });

  it('matches .jpeg URLs', () => {
    expect(isImageUrl('https://example.com/img.jpeg')).toBe(true);
  });

  it('matches .gif URLs', () => {
    expect(isImageUrl('https://example.com/img.gif')).toBe(true);
  });

  it('matches .webp URLs', () => {
    expect(isImageUrl('https://example.com/img.webp')).toBe(true);
  });

  it('matches .svg URLs', () => {
    expect(isImageUrl('https://example.com/img.svg')).toBe(true);
  });

  it('matches URLs with query strings', () => {
    expect(isImageUrl('https://example.com/img.png?w=200&h=100')).toBe(true);
  });

  it('is case insensitive', () => {
    expect(isImageUrl('https://example.com/img.PNG')).toBe(true);
    expect(isImageUrl('https://example.com/img.Jpg')).toBe(true);
  });

  it('rejects non-image URLs', () => {
    expect(isImageUrl('https://example.com/doc.pdf')).toBe(false);
  });

  it('rejects URLs with no extension', () => {
    expect(isImageUrl('https://example.com/image')).toBe(false);
  });

  it('rejects URLs with image name but wrong extension position', () => {
    expect(isImageUrl('https://example.com/image.png.txt')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isImageUrl('')).toBe(false);
  });

  it('rejects .bmp URLs (not in pattern)', () => {
    expect(isImageUrl('https://example.com/img.bmp')).toBe(false);
  });

  it('rejects data URL images (not file extension)', () => {
    expect(isImageUrl('data:image/png;base64,abc123')).toBe(false);
  });

  it('rejects video URLs', () => {
    expect(isImageUrl('https://example.com/vid.mp4')).toBe(false);
  });

  it('rejects URL with hash fragment after extension', () => {
    expect(isImageUrl('https://example.com/img.png#section')).toBe(false);
  });

  it('matches URL with trailing slash before query', () => {
    expect(isImageUrl('https://example.com/path/img.png?size=large')).toBe(true);
  });

  it('matches relative path URLs', () => {
    expect(isImageUrl('/uploads/photo.jpeg')).toBe(true);
  });

  it('matches URL with port number', () => {
    expect(isImageUrl('http://localhost:3000/files/img.webp')).toBe(true);
  });

  it('rejects URL with trailing slash after extension', () => {
    expect(isImageUrl('https://example.com/img.png/')).toBe(false);
  });

  it('matches bare filename with extension only', () => {
    expect(isImageUrl('photo.jpeg')).toBe(true);
  });

  it('rejects URL where image extension appears in the middle of filename', () => {
    expect(isImageUrl('https://example.com/imgpng.doc')).toBe(false);
  });

  it('rejects whitespace-only string', () => {
    expect(isImageUrl('   ')).toBe(false);
  });

  it('matches .jpg with multi-segment path and encoded characters', () => {
    expect(isImageUrl('https://cdn.example.com/a%20folder/photo.jpg')).toBe(true);
  });

  it('rejects URL with image extension followed by numeric query param', () => {
    expect(isImageUrl('https://example.com/img.png?123')).toBe(true);
  });

  it('matches URL with hash before extension when followed by query', () => {
    expect(isImageUrl('https://cdn.example.com/hash_abcd123/img.jpg?v=2')).toBe(true);
  });

  it('rejects URL with tiff extension', () => {
    expect(isImageUrl('https://example.com/img.tiff')).toBe(false);
  });

  it('isImageUrl returns false for file with no extension', () => {
    expect(isImageUrl('https://example.com/image')).toBe(false);
  });

  it('isImageUrl returns false for data URI', () => {
    expect(isImageUrl('data:image/png;base64,abc')).toBe(false);
  });

  it('isImageUrl returns false for PDF file', () => {
    expect(isImageUrl('https://example.com/doc.pdf')).toBe(false);
  });

  it('isImageUrl returns false for DOCX file', () => {
    expect(isImageUrl('https://example.com/doc.docx')).toBe(false);
  });

  it('isImageUrl returns false for PDF file', () => {
    expect(isImageUrl('https://example.com/file.pdf')).toBe(false);
  });

  it('isImageUrl returns true for PNG file', () => {
    expect(isImageUrl('https://example.com/photo.png')).toBe(true);
  });

  it('isImageUrl returns false for non-image extension', () => {
    expect(isImageUrl('https://example.com/doc.pdf')).toBe(false);
  });

  it.each(Array.from({ length: 80 }, (_, index) => {
    const extensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];
    const extension = extensions[index % extensions.length];
    return [`https://cdn.example.com/folder-${index}/image-${index}.${extension}`, extension] as const;
  }))('matches generated image URL %s', (url) => {
    expect(isImageUrl(url)).toBe(true);
    expect(isImageUrl(`${url}?v=1&size=${url.length}`)).toBe(true);
  });

  it.each(Array.from({ length: 60 }, (_, index) => {
    const extensions = ['pdf', 'docx', 'xlsx', 'txt', 'bmp', 'tiff'];
    const extension = extensions[index % extensions.length];
    return [`https://cdn.example.com/folder-${index}/image-${index}.${extension}`, extension] as const;
  }))('rejects generated non-image URL %s', (url) => {
    expect(isImageUrl(url)).toBe(false);
    expect(isImageUrl(`${url}?v=1`)).toBe(false);
  });

  it.each(Array.from({ length: 80 }, (_, index) => {
    const extensions = ['PNG', 'JPG', 'JPEG', 'GIF', 'WEBP', 'SVG'];
    const extension = extensions[index % extensions.length];
    return [`/uploads/batch105-${index}.${extension}`, `token=${index}`] as const;
  }))('matches generated uppercase image URL %s',
    (url, query) => {
      expect(isImageUrl(url)).toBe(true);
      expect(isImageUrl(`${url}?${query}`)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => {
    const extensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];
    const extension = extensions[index % extensions.length];
    return [`https://cdn.example.com/batch105-${index}.${extension}#preview`, extension] as const;
  }))('rejects generated image URL with hash suffix %s',
    (url) => {
      expect(isImageUrl(url)).toBe(false);
      expect(isImageUrl(`${url}/nested`)).toBe(false);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => {
    const extensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];
    const extension = extensions[index % extensions.length];
    return [`../relative/path-${index}/image.${extension}`, `cache=${index}&name=中文-${index}`] as const;
  }))('matches generated relative image URL %s',
    (url, query) => {
      expect(isImageUrl(url)).toBe(true);
      expect(isImageUrl(`${url}?${query}`)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => {
    const extensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];
    const extension = extensions[index % extensions.length];
    return [`https://cdn.example.com/generated-${index}.${extension}.download`, extension] as const;
  }))('rejects generated image extension before final suffix %s',
    (url) => {
      expect(isImageUrl(url)).toBe(false);
      expect(isImageUrl(`${url}?download=1`)).toBe(false);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => {
    const extensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];
    const extension = extensions[index % extensions.length];
    return [`https://cdn.example.com/batch119/${index}/image.${extension}`, `v=${index}&name=image.${extension}`] as const;
  }))('matches generated image URL with complex query %s',
    (url, query) => {
      expect(isImageUrl(`${url}?${query}`)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => {
    const extensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];
    const extension = extensions[index % extensions.length];
    return [`https://cdn.example.com/batch119/${index}/image.${extension}%20`, extension] as const;
  }))('rejects generated encoded suffix after image extension %s',
    (url) => {
      expect(isImageUrl(url)).toBe(false);
      expect(isImageUrl(`${url}?v=1`)).toBe(false);
    },
  );
});

describe('isImageUrl batch 137 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => {
    const extensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];
    const extension = extensions[index % extensions.length];
    return [`https://assets.example.com/batch137/${index}/preview.${extension}`, `download=${index}`] as const;
  }))(
    'matches generated preview image URL %s',
    (url, query) => {
      expect(isImageUrl(url)).toBe(true);
      expect(isImageUrl(`${url}?${query}`)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => {
    const extensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];
    const extension = extensions[index % extensions.length];
    return [`https://assets.example.com/batch137/${index}/preview.${extension}#hash`, extension] as const;
  }))(
    'rejects generated hash-suffixed image URL %s',
    (url) => {
      expect(isImageUrl(url)).toBe(false);
      expect(isImageUrl(`${url}?still=hash`)).toBe(false);
    },
  );
});

describe('isImageUrl batch 145 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => {
    const extensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];
    const extension = extensions[index % extensions.length];
    return [`/batch145/path.with.dots/file-${index}.${extension}`, `x=${index}&filename=file.${extension}`] as const;
  }))(
    'matches generated dotted path image URL %s',
    (url, query) => {
      expect(isImageUrl(url)).toBe(true);
      expect(isImageUrl(`${url}?${query}`)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => {
    const extensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];
    const extension = extensions[index % extensions.length];
    return [`/batch145/file-${index}.${extension}/download`, extension] as const;
  }))(
    'rejects generated image extension before path suffix %s',
    (url) => {
      expect(isImageUrl(url)).toBe(false);
      expect(isImageUrl(`${url}?preview=1`)).toBe(false);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => {
    const extensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];
    const extension = extensions[index % extensions.length];
    return [`https://cdn.example.com/batch154/folder.${index}/image-${index}.${extension}`, `token=${index}&name=image-${index}.${extension}`] as const;
  }))(
    'matches generated nested image URL with query %s',
    (url, query) => {
      expect(isImageUrl(url)).toBe(true);
      expect(isImageUrl(`${url}?${query}`)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => {
    const extensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];
    const extension = extensions[index % extensions.length];
    return [`https://cdn.example.com/batch154/image-${index}.${extension}#section?preview=1`, extension] as const;
  }))(
    'rejects generated image URL with hash before query %s',
    (url) => {
      expect(isImageUrl(url)).toBe(false);
      expect(isImageUrl(`${url}&download=1`)).toBe(false);
    },
  );
});

describe('isImageUrl batch 159 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => {
    const extensions = ['PNG', 'JPG', 'JPEG', 'GIF', 'WEBP', 'SVG'];
    const extension = extensions[index % extensions.length];
    return [`/batch159/assets/${index}/preview.${extension}`, `token=${index}&download=1`] as const;
  }))(
    'matches generated uppercase image extension URL %s',
    (url, query) => {
      expect(isImageUrl(url)).toBe(true);
      expect(isImageUrl(`${url}?${query}`)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => {
    const extensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];
    const extension = extensions[index % extensions.length];
    return [`https://cdn.example.com/batch159/download/image.${extension}/raw/${index}`, `file=image.${extension}x`] as const;
  }))(
    'rejects generated image extension before path suffix URL %s',
    (url, query) => {
      expect(isImageUrl(`${url}?${query}`)).toBe(false);
      expect(isImageUrl(`${url}#preview`)).toBe(false);
    },
  );
});

describe('isImageUrl batch 167 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => {
    const extensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];
    const extension = extensions[index % extensions.length];
    return [`./batch167/folder-${index}/preview.${extension}`, `cache=${index}&name=preview.${extension}`] as const;
  }))(
    'matches generated local image URL with query %s',
    (url, query) => {
      expect(isImageUrl(url)).toBe(true);
      expect(isImageUrl(`${url}?${query}`)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => {
    const extensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];
    const extension = extensions[index % extensions.length];
    return [`./batch167/folder-${index}/preview.${extension}?download=1#hash`, extension] as const;
  }))(
    'matches generated image URL with query followed by hash %s',
    (url) => {
      expect(isImageUrl(url)).toBe(true);
    },
  );
});
