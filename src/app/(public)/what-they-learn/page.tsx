import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, ChefHat, Heart, ShieldCheck, Sparkles } from 'lucide-react';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'What Your Child Will Learn | Blooming Tastebuds',
  description: 'Discover how Blooming Tastebuds helps children and teens build kitchen confidence, practical life skills and a love of healthy vegetarian food.',
};

const outcomes = [
  { image: '/images/outcome-kitchen-confidence.png', alt: 'A child confidently stirring a colourful vegetarian dish', title: 'Kitchen confidence', text: 'Children learn that the kitchen is a place for them—one small success at a time.' },
  { image: '/images/outcome-safe-skills.png', alt: 'A child learning safe food preparation', title: 'Safe practical skills', text: 'From hygiene to age-appropriate tools, good habits become second nature.' },
  { image: '/images/outcome-food-curiosity.png', alt: 'Children exploring colourful vegetables and ingredients', title: 'Food curiosity', text: 'They explore colourful ingredients, flavours and balanced meals without pressure.' },
  { image: '/images/outcome-creative-thinking.png', alt: 'A child creatively arranging a colourful vegetarian dish', title: 'Creative thinking', text: 'Choices, flavours and presentation show children there is more than one way to make something delicious.' },
  { image: '/images/outcome-teamwork.png', alt: 'Children working together on a cooking activity', title: 'Independence & teamwork', text: 'They organise their space, share tasks and feel proud of contributing.' },
];

const recipes = [
  { name: 'Tortilla pizzas', text: 'Building colourful toppings from fresh ingredients.', skills: ['Food preparation', 'Creativity'] },
  { name: 'Rainbow wraps', text: 'Exploring vegetables, textures and balanced fillings.', skills: ['Safe cutting', 'Presentation'] },
  { name: 'Fresh pasta', text: 'Seeing simple ingredients become a meal from scratch.', skills: ['Measuring', 'Patience'] },
  { name: 'Vegetable muffins', text: 'A friendly way to bake, mix and try vegetables differently.', skills: ['Weighing', 'Organisation'] },
];

export default function WhatTheyLearnPage() {
  return (
    <>
      <section className={styles.hero}>
        <Image src="/images/what-they-learn-hero.png" alt="Children cooking colourful vegetarian food with their instructor" fill priority sizes="100vw" className={styles.heroImage} />
        <div className={styles.heroShade} />
        <div className={`container ${styles.heroContent}`}>
          <span className={styles.eyebrow}>More than a cooking class</span>
          <h1>Cooking skills for life, served with confidence.</h1>
          <p>Through hands-on vegetarian cooking, children build practical skills, independence and a happier relationship with food—one delicious dish at a time.</p>
          <Link href="/classes#sessions" className="btn btn-primary">Find a class <ArrowRight size={18} /></Link>
        </div>
      </section>

      <section className={`section ${styles.intro}`}>
        <div className="container">
          <span className="eyebrow">The Blooming Tastebuds difference</span>
          <h2>Every dish is a chance to grow.</h2>
          <p>Cooking naturally teaches children how to plan, make choices, solve small problems and take pride in what they create. We keep it enjoyable and age-appropriate, so every child can learn at their own pace and leave feeling capable.</p>
        </div>
      </section>

      <section className={`section ${styles.outcomes}`}>
        <div className="container">
          <div className={styles.sectionHeading}>
            <span className="eyebrow">What they take away</span>
            <h2>Skills that reach far beyond the kitchen.</h2>
          </div>
          <div className={styles.outcomeGrid}>
            {outcomes.map((outcome) => (
              <article className={styles.outcomeCard} key={outcome.title}>
                <Image src={outcome.image} alt={outcome.alt} width={900} height={600} className={styles.outcomeImage} />
                <h3>{outcome.title}</h3>
                <p>{outcome.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={`section ${styles.journeys}`}>
        <div className="container">
          <div className={styles.sectionHeading}>
            <span className="eyebrow">Two cooking journeys</span>
            <h2>The right challenge at every stage.</h2>
          </div>
          <div className={styles.journeyGrid}>
            <article className={`${styles.journeyCard} ${styles.juniorJourney}`}>
              <Image src="/images/kids-cooking.png" alt="Junior cooks mixing ingredients together in a cooking class" width={640} height={640} className={styles.juniorImage} />
              <div className={styles.juniorContent}>
              <span className={styles.ageBadge}>Ages 5–11</span>
              <h3>Junior Cooks</h3>
              <p className={styles.journeyLead}>A joyful start to cooking from scratch.</p>
              <p>Junior Cooks explore fresh ingredients, learn everyday kitchen routines and discover that healthy food can be colourful, creative and delicious.</p>
              <h4>They may practise</h4>
              <ul><li>Washing, measuring and mixing</li><li>Safe cutting with age-appropriate guidance</li><li>Recognising vegetables, herbs and flavours</li><li>Presenting a dish proudly</li></ul>
              <Link href="/classes#sessions" className={styles.textLink}>Find Junior Cook classes <ArrowRight size={16} /></Link>
              </div>
            </article>
            <article className={`${styles.journeyCard} ${styles.teenJourney}`}>
              <Image src="/images/what-they-learn-teens.png" alt="Teenagers preparing a vegetarian meal together" width={1536} height={1024} className={styles.teenImage} />
              <div className={styles.teenContent}>
                <span className={styles.ageBadge}>Ages 12–18</span>
                <h3>Teen Chefs</h3>
                <p className={styles.journeyLead}>Real-world skills for growing independence.</p>
                <p>Teen Chefs build technique, understand how to plan a balanced meal and gain confidence making food for themselves, friends and family.</p>
                <h4>They may practise</h4>
                <ul><li>Confident food preparation and knife technique</li><li>Balancing flavours and adapting recipes</li><li>Planning a meal and managing a budget</li><li>Cooking independently with pride</li></ul>
                <Link href="/classes#sessions" className={styles.textLink}>Find Teen Chef classes <ArrowRight size={16} /></Link>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className={`section ${styles.termJourney}`}>
        <div className="container">
          <div className={styles.termGrid}>
            <div>
              <span className="eyebrow">Inside a typical term</span>
              <h2>Learning builds, one delicious dish at a time.</h2>
              <p>Our terms are designed to build confidence gradually: starting with kitchen routines and simple preparation, then using those foundations to create fuller dishes and make choices of their own.</p>
            </div>
            <ol className={styles.steps}>
              <li><span>01</span><div><strong>Start with confidence</strong><p>Kitchen routines, hygiene and simple preparation.</p></div></li>
              <li><span>02</span><div><strong>Discover ingredients</strong><p>Colour, texture, vegetables, herbs and flavours.</p></div></li>
              <li><span>03</span><div><strong>Build technique</strong><p>Measuring, mixing, cutting and cooking methods.</p></div></li>
              <li><span>04</span><div><strong>Make it their own</strong><p>Toppings, seasoning, plating and small adaptations.</p></div></li>
            </ol>
          </div>
        </div>
      </section>

      <section className={`section ${styles.recipeSection}`}>
        <div className="container">
          <div className={styles.sectionHeading}>
            <span className="eyebrow">A taste of the programme</span>
            <h2>Recipes with a purpose.</h2>
            <p>Every recipe gives children a delicious reason to practise a new skill. Menus vary by programme, season and class needs.</p>
          </div>
          <div className={styles.recipeGrid}>
            {recipes.map((recipe, index) => (
              <article className={styles.recipeCard} key={recipe.name}>
                <div className={`${styles.recipeIllustration} ${styles[`recipe${index + 1}`]}`}><ChefHat size={34} aria-hidden="true" /></div>
                <div className={styles.recipeCopy}><h3>{recipe.name}</h3><p>{recipe.text}</p><ul>{recipe.skills.map((skill) => <li key={skill}>{skill}</li>)}</ul></div>
              </article>
            ))}
          </div>
          <p className={styles.disclaimer}>Recipes may be adapted for seasonal ingredients, allergen management or class needs.</p>
        </div>
      </section>

      <section className={`section ${styles.teaching}`}>
        <div className="container">
          <div className={styles.teachingGrid}>
            <div><span className="eyebrow">How we teach</span><h2>Supportive, hands-on from the start.</h2><p>Children learn best by doing. Every session is led in a calm, encouraging environment where they can ask questions, practise new skills and take pride in the food they make.</p></div>
            <ul className={styles.teachingList}><li><Heart size={20} /> A warm welcome and a clear introduction to the day&apos;s dish</li><li><ChefHat size={20} /> Guided, hands-on preparation from first ingredient to final plate</li><li><ShieldCheck size={20} /> Age-appropriate safety and hygiene built into every session</li><li><Sparkles size={20} /> Time to create, taste and celebrate what they have made</li></ul>
          </div>
        </div>
      </section>

      <section className={`section ${styles.reassurance}`}>
        <div className="container">
          <div className={styles.sectionHeading}><span className="eyebrow">Made with care</span><h2>Food, safety and inclusion matter.</h2></div>
          <div className={styles.reassuranceGrid}><p>100% vegetarian cooking</p><p>Allergy-aware planning</p><p>DBS-checked instructor</p><p>Aprons and core equipment provided</p></div>
        </div>
      </section>

      <section className={styles.cta}>
        <div className="container"><span className={styles.eyebrow}>Ready when they are</span><h2>Ready to find their next favourite dish?</h2><p>Browse upcoming classes and find the right cooking journey for your child.</p><Link href="/classes#sessions" className="btn btn-primary">Find a class <ArrowRight size={18} /></Link></div>
      </section>
    </>
  );
}
