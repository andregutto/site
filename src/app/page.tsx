import "./home.css";
import Nav from "@/components/home/Nav";
import Hero from "@/components/home/Hero";
import FilmStrip from "@/components/home/FilmStrip";
import Sobre from "@/components/home/Sobre";
import Eixos from "@/components/home/Eixos";
import VideosSection from "@/components/home/VideosSection";
import Ferramentas from "@/components/home/Ferramentas";
import Night from "@/components/home/Night";
import Footer from "@/components/home/Footer";

export default function Home() {
  return (
    <div className="ag-page">
      <Nav />
      <main>
        <Hero />
        <FilmStrip />
        <Sobre />
        <Eixos />
        <VideosSection />
        <Ferramentas />
        <Night />
      </main>
      <Footer />
    </div>
  );
}
