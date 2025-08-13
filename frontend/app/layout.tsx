import "./globals.css";
export const metadata={title:"Invoice → Excel",description:"Upload an invoice photo, extract fields, and append to Excel."};
export default function RootLayout({children}:{children:React.ReactNode}){return(<html lang="en"><body className="min-h-screen grid place-items-center">{children}</body></html>)}
