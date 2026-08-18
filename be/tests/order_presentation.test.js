const { getUpdatedImgUrl } = require('../services/orderPresentation');

const originalAddress = process.env.ADDRESS;

afterEach(() => {
  if (originalAddress === undefined) {
    delete process.env.ADDRESS;
  } else {
    process.env.ADDRESS = originalAddress;
  }
});

describe('Order presentation image rewriting', () => {
  it('rewrites supported image namespaces with the full configured address', () => {
    process.env.ADDRESS = 'https://presentation.example/base/';

    expect(getUpdatedImgUrl('https://old.example/images/a.webp'))
      .toBe('https://presentation.example/base/images/a.webp');
    expect(getUpdatedImgUrl('https://old.example/prefix/section-images/a.webp'))
      .toBe('https://presentation.example/base/section-images/a.webp');
  });

  it('keeps unmatched, invoice and falsy URLs unchanged', () => {
    process.env.ADDRESS = 'https://presentation.example';

    expect(getUpdatedImgUrl('https://old.example/files/a.webp'))
      .toBe('https://old.example/files/a.webp');
    expect(getUpdatedImgUrl('/invoice-images/a.webp')).toBe('/invoice-images/a.webp');
    expect(getUpdatedImgUrl('')).toBe('');
    expect(getUpdatedImgUrl(undefined)).toBeUndefined();
  });

  it('keeps the original URL when ADDRESS is absent', () => {
    delete process.env.ADDRESS;
    expect(getUpdatedImgUrl('https://old.example/images/a.webp'))
      .toBe('https://old.example/images/a.webp');
  });
});
