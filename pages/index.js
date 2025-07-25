import Footer from "@/components/footer/Footer";
import Head from "next/head";

export default function Home() {
  return (
    <>
      <Head>
        <title>Datahub - Bank info</title>
        <meta name="description" content="Generated by create next app" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="assets/favicon.png" />
      </Head>
      <div className="main-content">
        <div className="row">
          {/* <BankReport />
          <NewBank /> */}
        </div>
        <Footer />
      </div>
    </>
  );
}
