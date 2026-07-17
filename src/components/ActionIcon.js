const paths = {
  plus: ['M12 5v14', 'M5 12h14'],
  view: ['M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z'],
  upload: ['M12 16V4', 'm7 9 5-5 5 5', 'M5 20h14'],
  download: ['M12 4v12', 'm7 11 5 5 5-5', 'M5 20h14'],
  arrow: ['M5 12h14', 'm14 7 5 5-5 5'],
  refresh: ['M20 7v5h-5', 'M4 17v-5h5', 'M6.1 9a7 7 0 0 1 11.3-2L20 12', 'M4 12l2.6 5a7 7 0 0 0 11.3-2'],
  sync: ['M7 7h11l-3-3', 'm18 7-3 3', 'M17 17H6l3 3', 'm6 17 3-3'],
  search: ['M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14Z', 'm16 16 5 5'],
  save: ['M5 4h12l2 2v14H5z', 'M8 4v6h8V4', 'M8 20v-6h8v6'],
  print: ['M6 9V4h12v5', 'M6 18H4V9h16v9h-2', 'M7 14h10v7H7z'],
  clear: ['M6 6l12 12', 'M18 6 6 18'],
  reset: ['M4.5 14.5 12 7a2.1 2.1 0 0 1 3 0l2 2a2.1 2.1 0 0 1 0 3l-7 7H6l-1.5-1.5a2.1 2.1 0 0 1 0-3Z', 'M10 19h10'],
};

export default function ActionIcon({ name }) {
  return (
    <svg className="action-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none">
      {paths[name].map((path, index) => <path d={path} key={index} />)}
    </svg>
  );
}
