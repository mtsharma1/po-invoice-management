import './globals.css';

export const metadata = {
  title: 'Teakwood PO & Invoice',
  description: 'Web migration of Teakwood PO and Invoice Management',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
