import Nav from "@/components/Nav";
import Hero from "@/components/Hero";
import Sobre from "@/components/Sobre";
import Videos from "@/components/Videos";
import Ferramentas from "@/components/Ferramentas";
import Newsletter from "@/components/Newsletter";
import Parceiros from "@/components/Parceiros";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Sobre />
        <Videos />
        <Ferramentas />
        <Newsletter />
        <Parceiros />
      </main>
      <Footer />
    </>
  );
}
