export const getWaybackDate = (value) => {
  const str = '' + value;
  return new Date(
    `${str.substr(0, 4)}-${str.substr(4, 2)}-${str.substr(6, 2)} ${str.substr(
      8,
      2
    )}:${str.substr(10, 2)}:${str.substr(12, 2)}`
  );
};

export const pad = (n, width, z) => {
  z = z || '0';
  n = n + '';
  return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
};

export const formatWaybackDate = (value) => {
  const d = getWaybackDate('' + value);
  return `${pad(d.getDate(), 2)}.${pad(
    d.getMonth() + 1,
    2
  )}.${d.getFullYear()}`;
};
