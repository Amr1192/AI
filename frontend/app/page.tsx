import Hero from "@/components/hero";
import Mission from "@/components/mission";
import Features from "@/components/features";
import Supercharger from "@/components/supercharger";
import Testimonials from "@/components/testimonials";
import FAQs from "@/components/faqs";
import CTA from "@/components/cta";
import Footer from "@/components/footer";

export default function Home() {
  return (
    <main className="min-h-screen bg-background">
      <Hero />
      <Mission />
      <Features />
      <Supercharger />
      <Testimonials />
      <FAQs />
      <CTA />
      <Footer />
    </main>
  );
}
