const { removeVietnameseTones } = require('./textNormalization');

const SEARCH_EDGE_STOPWORDS = new Set([
  'tim', 'kiem', 'timkiem', 'cho', 'toi', 'xem', 'gia', 'la', 'bao', 'nhieu',
  'con', 'hang', 'khong', 'co', 'san', 'pham', 'sanpham', 'giup', 'minh',
  'cai', 'chiec', 'the', 'nao', 'oi', 'nhe', 'nha', 'vay', 'hoi',
]);

function stripSearchEdgeWords(search) {
  const rawTokens = String(search || '').split(/\s+/).filter(Boolean);
  let start = 0;
  while (
    start < rawTokens.length
    && SEARCH_EDGE_STOPWORDS.has(removeVietnameseTones(rawTokens[start]).toLowerCase())
  ) {
    start += 1;
  }

  let tokens = rawTokens.slice(start);
  while (
    tokens.length > 0
    && SEARCH_EDGE_STOPWORDS.has(removeVietnameseTones(tokens[tokens.length - 1]).toLowerCase())
  ) {
    tokens = tokens.slice(0, -1);
  }
  return tokens;
}

module.exports = { stripSearchEdgeWords };
