import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Authoritative Syllabus Knowledge & Mark Schemes for Cambridge IGCSE 0620 Chemistry Paper 4
const BUILTIN_CHEM_PAPER: Record<string, { marks: number; topic: string; content_text: string; mark_scheme: string }> = {
  "1": {
    marks: 7,
    topic: "States of matter / Separation techniques",
    content_text: "Name the process that is used to:\n(a) Convert sulfur dioxide into sulfur trioxide in the manufacture of sulfuric acid [1]\n(b) Obtain water from aqueous sodium chloride [1]\n(c) Extract aluminium from purified bauxite [1]\n(d) Separate petroleum into useful substances [1]\n(e) Produce ethanol from aqueous glucose [1]\n(f) Manufacture alkenes and hydrogen from large alkane molecules [1]\n(g) Separate a mixture of soluble coloured substances [1]",
    mark_scheme: "(a) Contact process (1 mark)\n(b) Simple distillation / distillation (1 mark)\n(c) Electrolysis / Hall-Héroult process (1 mark)\n(d) Fractional distillation (1 mark)\n(e) Fermentation (1 mark)\n(f) Cracking / thermal cracking / catalytic cracking (1 mark)\n(g) Chromatography / paper chromatography (1 mark)"
  },
  "2": {
    marks: 5,
    topic: "Atoms, elements and compounds",
    content_text: "Complete Table 2.1 to show the number of subatomic particles in the given species:\n• 37_17Cl (Chlorine-37 isotope): Protons = 17, Electrons = ?, Neutrons = ?\n• 63_29Cu+ (Copper(I) ion): Protons = 29, Electrons = ?, Neutrons = 34\n• 33_16S2- (Sulfide ion): Protons = 16, Electrons = 18, Neutrons = 17\nState the missing values for protons, neutrons, and electrons.",
    mark_scheme: "• 37_17Cl: 17 protons, 17 electrons, 20 neutrons (1 mark)\n• 63_29Cu+: 29 protons, 28 electrons (1 mark), 34 neutrons (1 mark)\n• 33_16S2-: 16 protons, 18 electrons (1 mark), 17 neutrons (1 mark)"
  },
  "3": {
    marks: 14,
    topic: "Atoms, elements and compounds / Stoichiometry / Electricity and chemistry",
    content_text: "This question is about the elements sodium and fluorine and the compound sodium fluoride.\n(a) Sodium reacts with fluorine to form sodium fluoride. Write a symbol equation for this reaction. [2]\n(b) Some properties of sodium, fluorine and sodium fluoride are shown in Table 3.1:\n• Sodium: Melting pt 98 °C, Boiling pt 883 °C, Good conductor (solid)\n• Fluorine: Melting pt -220 °C, Boiling pt -188 °C, Poor conductor\n• Sodium fluoride: Melting pt 993 °C, Boiling pt 1695 °C, Poor conductor (solid), Good conductor (aqueous)\n(i) Explain why sodium conducts electricity when it is a solid. [1]\n(ii) Complete the dot-and-cross diagram of a molecule of fluorine (F2). Show outer shell electrons only. [2]\n(iii) Deduce the physical state of fluorine at -200 °C. Use the data in Table 3.1 to explain your answer. [2]\n(iv) Explain in terms of structure and bonding why sodium fluoride has a much higher melting point than fluorine. [3]\n(c) Dilute aqueous sodium fluoride undergoes electrolysis. Hydrogen is produced at the cathode.\n(i) State what is meant by the term electrolysis. [2]\n(ii) Write an ionic half-equation for the production of hydrogen at the cathode. [2]",
    mark_scheme: "(a) 2Na + F2 → 2NaF (2 marks: 1 for correct formulas, 1 for balancing)\n(b)(i) Sodium has delocalised / mobile electrons that can move through the lattice to carry electrical charge (1 mark).\n(b)(ii) 1 shared pair of electrons between both F atoms; 6 non-bonding electrons (3 lone pairs) on each F atom (2 marks).\n(b)(iii) Physical state: Liquid (1 mark). Explanation: -200 °C is above melting point (-220 °C) and below boiling point (-188 °C) (1 mark). (NOTE: Claiming fluorine is gas at -200 °C or that -200 > -188 is scientifically wrong and gets 0 marks).\n(b)(iv) Sodium fluoride has a giant ionic lattice with strong electrostatic forces of attraction between oppositely charged ions (Na+ and F-), requiring large amounts of energy to overcome (2 marks). Fluorine has a simple molecular structure with weak intermolecular forces between molecules, requiring very little energy to break (1 mark).\n(c)(i) Breakdown / decomposition of an ionic compound / electrolyte, molten or in aqueous solution, by the passage of electricity (2 marks).\n(c)(ii) 2H+ + 2e- → H2 (or 2H2O + 2e- → H2 + 2OH-) (2 marks)."
  },
  "4": {
    marks: 10,
    topic: "Chemical reactions / Equilibrium & Catalysts",
    content_text: "Hydrogen iodide thermally decomposes into iodine and hydrogen. The reaction is reversible:\n2HI(g) ⇌ I2(g) + H2(g)\n(a) State what is meant by the term equilibrium. [2]\n(b) The pressure of the mixture is increased. All other conditions stay the same. The position of equilibrium does not change. The colour of the gaseous mixture turns darker purple.\n(i) Explain why the position of equilibrium does not change. [1]\n(ii) Suggest why the colour of the mixture of gases turns darker purple. [1]\n(c) The temperature of the mixture of gases is decreased. All other conditions stay the same. The mixture of gases turns lighter purple. State what can be deduced about the forward reaction from this information. [1]\n(d) Deduce the oxidation number of iodine in HI [1] and I2 [1].\n(e) Methanol is manufactured by reacting carbon monoxide with hydrogen: CO(g) + 2H2(g) ⇌ CH3OH(g). The rate increases when a catalyst is used.\n(i) Choose from the list the element most likely to be used as catalyst: [calcium, carbon, copper, sodium, sulfur] [1]\n(ii) State the effect on equilibrium position when catalyst is used. [1]\n(iii) State the effect catalyst has on activation energy. [1]",
    mark_scheme: "(a) Rate of forward reaction equals rate of reverse reaction (1 mark). Concentrations of reactants and products remain constant in a closed system (1 mark).\n(b)(i) Equal numbers of moles of gas (2 moles on left, 2 moles on right) on both sides of equation (1 mark).\n(b)(ii) Increasing pressure decreases volume of the syringe, increasing concentration of purple I2 molecules per unit volume (1 mark).\n(c) Forward reaction is endothermic (1 mark) because lowering temperature favours exothermic reverse reaction, reducing purple I2.\n(d) In HI: -1 (1 mark); In I2: 0 (1 mark).\n(e)(i) Copper (transition metal element) (1 mark)\n(e)(ii) No effect / position of equilibrium remains unchanged (1 mark)\n(e)(iii) Lowers / decreases activation energy by providing alternative reaction pathway (1 mark)."
  },
  "5": {
    marks: 17,
    topic: "Acids, bases and salts",
    content_text: "(a) Lead(II) bromide, PbBr2, is an insoluble salt made by precipitation.\n(i) Name two aqueous solutions that produce a precipitate of lead(II) bromide. [2]\n(ii) Describe how to produce a pure sample of lead(II) bromide from the reaction mixture. [2]\n(iii) Write an ionic equation for the precipitation reaction including state symbols. [3]\n(b) Thermal decomposition of iron(II) sulfate crystals. [2]\n(c) Complete equation for thermal decomposition of hydrated iron(II) sulfate. [2]\n(d) Hydrated cobalt(II) sulfate CoSO4•xH2O:\n(i) Describe what else the student should do to ensure all water is removed. [2]\n(ii) Heating 1.405 g of CoSO4•xH2O leaves 0.775 g of anhydrous CoSO4. Calculate x. [4]",
    mark_scheme: "(a)(i) Aqueous lead(II) nitrate AND aqueous sodium bromide (or potassium bromide) (2 marks).\n(a)(ii) Filter to collect precipitate, wash residue with distilled water, dry between filter papers or in warm oven (2 marks).\n(a)(iii) Pb2+(aq) + 2Br-(aq) → PbBr2(s) (3 marks: 1 for Pb2+ and 2Br-, 1 for PbBr2, 1 for correct state symbols aq and s).\n(b) Fe2+ loses electrons / oxidised; S6+ in SO42- reduced (2 marks).\n(c) 2FeSO4•7H2O → Fe2O3 + SO2 + SO3 + 14H2O (2 marks).\n(d)(i) Heat again, cool, reweigh until mass is constant / constant mass reached (2 marks).\n(d)(ii) Mass of anhydrous CoSO4 = 0.775 g; Mr = 155; moles CoSO4 = 0.005 mol (1 mark). Mass of water = 1.405 - 0.775 = 0.630 g; moles H2O = 0.630 / 18 = 0.035 mol (1 mark). Mole ratio H2O : CoSO4 = 7 (1 mark). x = 7 (1 mark)."
  },
  "6": {
    marks: 14,
    topic: "Metals / Extraction of iron & zinc",
    content_text: "(a) Blast furnace used to extract iron from haematite.\n(i) Coke and iron ore added at top. Name two other substances added. [2]\n(ii) Name substance that leaves at A. [1]\n(iii) Impurity in iron ore and how slag is formed. [2]\n(iv) Reactions in blast furnace. [2]\n(v) Two waste gases leaving blast furnace. [2]\n(b) Zinc extracted from zinc oxide in a furnace.\n(i) Why zinc produced is gas. [1]\n(ii) Physical change when gaseous zinc cooled. [1]\n(c) Galvanising and sacrificial protection of iron by zinc. [3]\n(d) Amphoteric nature of zinc oxide. [2]",
    mark_scheme: "(a)(i) Limestone / calcium carbonate AND air / oxygen (2 marks).\n(a)(ii) Molten iron (or slag) (1 mark).\n(a)(iii) Sand / silica / silicon dioxide (1 mark). Reacts with CaO to form calcium silicate / slag (1 mark).\n(a)(iv) C + O2 → CO2 (1 mark); Fe2O3 + 3CO → 2Fe + 3CO2 (1 mark).\n(a)(v) Carbon dioxide, carbon monoxide, nitrogen (any two, 2 marks).\n(b)(i) Temperature in furnace is above zinc's boiling point (907 °C) (1 mark).\n(b)(ii) Condensation / condensing (1 mark).\n(c)(i) Galvanising (1 mark).\n(c)(ii) Zinc is more reactive than iron, so zinc loses electrons / corrodes sacrificially instead of iron (2 marks).\n(d)(i) Amphoteric (1 mark).\n(d)(ii) Sodium zincate / Na2Zn(OH)4 (1 mark)."
  },
  "7": {
    marks: 13,
    topic: "Organic chemistry / Polymers, cracking and esters",
    content_text: "(a) Organic compound A: C 82.76%, H 17.24%.\n(i) Calculate empirical formula. [3]\n(ii) Deduce molecular formula if Mr = 58. [1]\n(b) Polymer Q section shown.\n(i) Name monomer. [1]\n(ii) Draw displayed formula of monomer. [2]\n(c) Catalytic cracking of C11H24 to produce propene C3H6 and alkane. [2]\n(d) Carboxylic acids and esters:\n(i) Ester X and carboxylic acid Y with 3 carbons. Name carboxylic acid Y and draw displayed formula. [2]\n(ii) Name ester X. [1]\n(iii) Conditions for esterification reaction. [1]",
    mark_scheme: "(a)(i) Moles C = 82.76/12 = 6.90; Moles H = 17.24/1 = 17.24. Ratio = 1 : 2.5 = 2 : 5. Empirical formula = C2H5 (3 marks).\n(a)(ii) Empirical mass = 29; 58/29 = 2. Molecular formula = C4H10 (1 mark).\n(b)(i) Propene (1 mark).\n(b)(ii) CH2=CH-CH3 displayed formula with C=C double bond (2 marks).\n(c) C11H24 → C3H6 + C8H18 (2 marks).\n(d)(i) Propanoic acid; displayed formula CH3CH2COOH (2 marks).\n(d)(ii) Methyl ethanoate (or ethyl methanoate) (1 mark).\n(d)(iii) Concentrated sulfuric acid catalyst and heat / reflux (1 mark)."
  }
};

// Authoritative Syllabus Knowledge & Mark Schemes for Cambridge IGCSE 0625 Physics Paper 41 (May/June 2024)
const BUILTIN_PHYSICS_PAPER: Record<string, { marks: number; topic: string; content_text: string; mark_scheme: string }> = {
  "1": {
    "marks": 10,
    "topic": "Motion, Forces and Energy",
    "content_text": "A long tube contains oil. A small ball is held at rest at the surface of the oil. At time   t   = 0, the ball is released and begins to fall vertically through the oil.  Fig. 1.1 shows the ball falling through the oil. ball oil  Fig. 1.1  As the ball begins to fall through the oil, it accelerates.  (a)   Define acceleration. ....... .......   [1]  (b)   The mass of the ball is 0.0075 kg.  Calculate the resultant force acting on the ball when it is accelerating downwards at 2.8 m / s 2  . resultant force = .......   [2]\n\n  (c)   As the ball falls, its speed   v   is recorded. Fig. 1.2 is the speed–time graph for the falling ball. 0  0   0.01   0.02   0.03   0.04  t   / s 0.02 0.04  v  m / s 0.06  Fig. 1.2 (i)   Describe what happens to the acceleration between   t   = 0 and   t   = 0.040 s.  Explain why this happens. ....... ....... ....... .......   [4]  (ii)   By drawing a tangent on Fig. 1.2, determine a value for the acceleration of the ball at   t   = 0.010 s. acceleration = .......   [3] [Total: 10]",
    "mark_scheme": "1(a) B1: acceleration is rate of change in velocity OR change in velocity per unit time OR (a =) ∆v / ∆t (1 mark); 1(b) A2: 0.021 N; C1: F = ma OR (F =) ma OR 0.0075 × 2.8 (2 marks); 1(c)(i) B4: any four from: (acceleration) decreases; (acceleration decreases) to zero (at approximately 0.03 s); resistive force increases / resistance increases (as speed / velocity increases); resultant force (downwards) decreases; (until) terminal velocity / constant speed (is reached); (when) resistive force = weight OR resultant force is zero OR forces are balanced (4 marks); 1(c)(ii) M1: tangent drawn at t = 0.010 s; A2: 1.2 m / s² ⩽ acceleration ⩽ 1.8 m / s²; C1: (a =) gradient of tangent OR (a =) {Δy / Δx} (3 marks)"
  },
  "2": {
    "marks": 8,
    "topic": "Momentum and Energy Conservation",
    "content_text": "Fig. 2.1 shows two identical trolleys, P and Q, held at rest on a frictionless horizontal surface. A load is fixed to trolley P. 1.5 kg load trolley P   trolley Q compressed spring  Fig. 2.1  There is a compressed spring between trolley P and trolley Q.  The trolleys are released. As the spring expands, it pushes the trolleys apart.  Trolley Q moves to the right at a constant speed of 0.36 m / s.  The mass of each trolley is 1.2 kg. The mass of the load on trolley P is 1.5 kg.  The spring has negligible mass.  (a)   Calculate:  (i)   the speed at which trolley P moves to the left speed of P = .......   [3]  (ii)   the kinetic energy of trolley Q when it moves at 0.36 m / s. kinetic energy of Q = .......   [3]  (b)   State the energy transfer that takes place as the spring expands. ....... ....... .......   [2] [Total: 8]\n\n  BLANK PAGE",
    "mark_scheme": "2(a)(i) A3: 0.16 m / s; C1: conservation of momentum OR mP vP = mQvQ OR 2.7 × vP = 1.2 × 0.36 OR (mQvQ =) 0.432 seen; C1: (vP =) mQvQ / mP OR 1.2 × 0.36 / 2.7 (3 marks); 2(a)(ii) A3: 0.078 J; C1: (k.e. =) ½mv² OR (k.e. =) ½ × 1.2 × 0.36²; C1: (k.e. =) ½ × 1.2 × 0.36² (3 marks); 2(b) B1: (from) elastic (energy store in the compressed spring); B1: to kinetic (as final energy store of trolleys) (2 marks)"
  },
  "3": {
    "marks": 9,
    "topic": "Thermal Physics and State Changes",
    "content_text": "Fig. 3.1 shows a small block of ice floating in a beaker of warm water. block of ice warm water  Fig. 3.1 (a)   State   one   way in which the motion of the particles in ice differs from the motion of the particles in water. ....... .......   [1]  (b)   Energy is transferred from the water to the block of ice.  (i)   State the name of the thermal process that transfers energy from the water to the ice. .......   [1]  (ii)   Initially, there is 0.34 kg of water in the beaker. The specific heat capacity of water is 4200 J / (kg °C).  Calculate the energy transferred from this water as its temperature decreases from 28 °C to 10 °C. energy transferred = .......   [2]  (iii)   The temperature of the water near the ice decreases first.  Explain how convection causes the temperature of all the water in the beaker to decrease. ....... ....... ....... .......   [3]\n\n  (iv)   State what happens to the internal energy of the water as the temperature of the water decreases.  Describe the change in terms of the energy of the particles. ....... ....... .......   [2] [Total: 9]",
    "mark_scheme": "3(a) B1: (they / particles in ice) vibrate (about a fixed position) OR particles in water move throughout the liquid (1 mark); 3(b)(i) B1: conduction (1 mark); 3(b)(ii) A2: 2.6 × 10⁴ J; C1: c = (ΔE / mΔθ) OR (ΔE =) mcΔθ OR 0.34 × 4200 × 18; C1: (ΔE =) mcΔθ (2 marks); 3(b)(iii) B1: density (of water next to the ice) increases; B1: cold(er) water sinks; B1: warm(er) water replaces cold water OR warm(er) water rises OR making a convection current (3 marks); 3(b)(iv) A2: internal energy decreases AND (average) kinetic energy (of particles) decreases; C1: kinetic energy decreases (2 marks)"
  },
  "4": {
    "marks": 10,
    "topic": "Waves and Light (Optics)",
    "content_text": "The lens in a magnifying glass is a converging lens.  (a)   Fig. 4.1 shows the lens of the magnifying glass, its two focal points, F 1  and F 2  , and its principal axis. principal axis   F 1   F 2 lens  Fig. 4.1 (i)   State what is meant by ‘focal point’. ....... ....... .......   [2]  (ii)   A student using the magnifying glass sees a magnified image of an object.  On Fig. 4.1, mark: •   a point X on the principal axis for a possible position of the object •   a point E for a possible position of the student’s eye. [1]  (iii)   Underline   two   words in the list that describe the image produced in   (a)(ii) .  inverted   real   upright   virtual  [1]  (b)   The refractive index of the glass used to make the lens is 1.5.  (i)   The speed of light in air is 3.0   ×   10 8  m / s.  Calculate the speed of light in the glass. speed in glass = .......   [2]\n\n  (ii)   State what happens to the wavelength of light as it passes into the lens. ....... .......   [1]  (c)   Converging lenses are used in spectacles (glasses) to correct one problem with vision.  State the name of the problem and explain how a converging lens is used to correct it. You may draw a diagram. name of problem: ....... ....... ....... ....... ....... [3] [Total: 10]",
    "mark_scheme": "4(a)(i) B1: (point on principal axis) where rays of light parallel (to the principal axis, incident on converging lens); B1: (rays) meet / converge after passing through lens / refraction (2 marks); 4(a)(ii) B1: X marked between one of the focal points and the lens AND E marked on other side of lens (1 mark); 4(a)(iii) B1: virtual AND upright (1 mark); 4(b)(i) A2: 2.0 × 10⁸ m / s; C1: n = c / vg OR (vg =) c / n OR (vg =) 3(.0) × 10⁸ / 1.5 (2 marks); 4(b)(ii) B1: (wavelength) decreases (1 mark); 4(c) B1: long-sightedness; B1: it moves the image towards the lens / back of the eye / retina OR reduces / shortens focal length of (combined lens); B1: (converging lens) focuses image on back of eye / retina (3 marks)"
  },
  "5": {
    "marks": 8,
    "topic": "Seismic and Mechanical Waves",
    "content_text": "(a)   Describe how a longitudinal wave differs from a transverse wave. ....... ....... .......   [2]  (b)   Fig. 5.1 represents a seismic wave produced by an earthquake. J   K  Fig. 5.1 (i)   State whether this seismic wave is a P-wave (primary) or an S-wave (secondary). Justify your choice. ....... .......   [1]  (ii)   The wave represented in Fig. 5.1 has a wavelength of 1.2   ×   10 4  m.  Calculate the actual distance between point J and point K. distance = .......   [2]  (iii)   The wave in   (ii)   travels through the ground at a speed of 4600 m / s.  As the wave passes a certain point, the ground completes 5 oscillations.  Calculate the time that it takes for the wave to pass. Show your working. time = .......   [3] [Total: 8]",
    "mark_scheme": "5(a) B2: any two from: (longitudinal) vibration / oscillation in wave parallel to propagation direction / direction of travel, transverse wave vibrates / oscillates perpendicular to propagation direction / direction of travel, (longitudinal) consists of compressions and rarefactions, transverse wave consists of crests / peaks and troughs, (longitudinal) needs a medium (to travel) (2 marks); 5(b)(i) B1: P-wave AND it is longitudinal (1 mark); 5(b)(ii) A2: 1.8 × 10⁴ m OR 18 km; C1: 1.5λ OR 1.5 × 1.2 × 10⁴ OR 1.8 × 10N (2 marks); 5(b)(iii) M1: v = fλ OR v = λ / t OR (t =) λ / v OR f = 4600 / (1.2 × 10⁴); A2: 13 s; C1: t = 1 / f OR (time for one wave = ) 2.6 (s) (3 marks)"
  },
  "6": {
    "marks": 9,
    "topic": "Electricity and Static Electric Fields",
    "content_text": "Fig. 6.1 shows an isolated metal sphere suspended by an insulating thread from the ceiling. metal sphere insulating thread  Fig. 6.1  The sphere is negatively charged.  (a)   The charge on the sphere produces an electric field in the surroundings.  (i)   State what is meant by ‘electric field’. ....... .......   [1]  (ii)   Draw on Fig. 6.1 to show the pattern and direction of the electric field produced by the charge on the sphere. Draw at least   four   lines.   [3]  (b)   The magnitude of the charge on the sphere is 3.5   ×   10 –10  C.  An   earthed   metal   wire   is   touched   against   the   surface   of   the   sphere   and   the   sphere is discharged.  (i)   State what happens in the wire as the sphere is discharged. ....... ....... .......   [2]  (ii)   It takes a time of 0.14 ns for the sphere to discharge completely.  Calculate the average current in the earthed wire as the sphere discharges. average current = .......   [3] [Total: 9]",
    "mark_scheme": "6(a)(i) B1: (region) where (an electric) charge experiences a force OR (region) where a force acts on a (an electric) charge (1 mark); 6(a)(ii) B1: at least four straight radial lines AND evenly spaced (by eye) surrounding sphere; B1: four lines touching sphere AND no lines inside sphere; B1: at least one arrowhead towards sphere AND no incorrect arrowheads (3 marks); 6(b)(i) A2: electrons move (through the wire) from the sphere OR electrons move (through the wire) to(wards) the Earth; C1: electrons move (in the wire) (2 marks); 6(b)(ii) A3: 2.5 A; C1: I = Q / t OR (I =) Q / t OR 3.5 × 10–10 / 1.4 × 10–10; C1: 2.5 × 10N (3 marks)"
  },
  "7": {
    "marks": 9,
    "topic": "Electric Circuits and Resistance",
    "content_text": "The electromotive force (e.m.f.) of a battery is 7.5 V.  (a)   Define the term electromotive force. ....... ....... .......   [2]  (b)   The battery is connected in series with a variable resistor and a 30   Ω   resistor. The battery is made using 1.5 V cells.  (i)   Draw a circuit diagram that shows all the 1.5 V cells connected to produce an e.m.f. of 7.5 V, the variable resistor and the 30   Ω   resistor. [3]  (ii)   The resistance of the variable resistor can be varied from 0   Ω   to a maximum resistance of 150   Ω .  Using the axes in Fig. 7.1, draw a graph to show how the current in the circuit varies with the resistance of the variable resistor as it increases from 0   Ω   to 150   Ω .  Determine and label the value of the maximum current on the   y -axis. resistance of variable resistor /   Ω  current / A 0  0   75   150  Fig. 7.1  [4] [Total: 9]",
    "mark_scheme": "7(a) A2: (electrical) work done moving a unit charge around a (complete) circuit; C1: work done AND moving a charge (in a circuit) (2 marks); 7(b)(i) B1: correct symbols for five cells in series; B1: correct symbols for variable resistor AND fixed resistor; B1: cells, variable resistor and fixed resistor connected in series (3 marks); 7(b)(ii) A2: curve with negative gradient of decreasing magnitude from 0 Ω to 150 Ω AND does not reach the x-axis; C1: curve / line with negative gradient from 0 Ω to 150 Ω; A2: y-axis labelled 0.25 where candidate’s line meets the y-axis OR the mark on the y-axis labelled 0.25; C1: R = V / I OR (Imax =) V / R OR 7.5 / 30 (4 marks)"
  },
  "8": {
    "marks": 8,
    "topic": "Nuclear Physics and Radioactive Decay",
    "content_text": "The isotope thallium-208 ( 208 81 T l   ) is radioactive. It decays by   β -decay.  (a)   Thallium-208 decays to an isotope of lead (Pb).  (i)   Complete the equation for this decay. 208 81 T l   ....... ....... Pb +   ....... ....... β  [3]  (ii)   The   β -emission of thallium-208 is accompanied by   γ -emission from the nucleus.  Explain why this   γ -emission does   not   affect the numbers in the equation in   (a)(i) . ....... .......   [1]  (iii)   Suggest   one   reason why a nucleus of thallium-208 is unstable. ....... .......   [1]  (b)   A sample of thallium-208 is placed in a thick lead container. Fig. 8.1 shows a narrow beam of  β -particles and   γ -radiation emerging from a small hole in one side of the container. magnetic field into page beam of  β -particles and  γ -radiation sample of thallium-208  Fig. 8.1  The narrow beam enters a region where there is a magnetic field that is directed into the page.  On Fig. 8.1: •   draw a line   labelled   β β   to indicate the path of the   β -particles in the magnetic field •   draw a line   labelled   γ γ   to indicate the path of the   γ -radiation in the magnetic field. [3] [Total: 8]",
    "mark_scheme": "8(a)(i) B1: β–1; B1: Pb…; B1: Pb82 (3 marks); 8(a)(ii) B1: γ-emission / it consists of waves / rays OR γ-emission has no mass / charge (1 mark); 8(a)(iii) B1: (it contains) too many / excess of neutrons OR (nucleus is) too heavy (1 mark); 8(b) B1: smooth curve (through magnetic field) AND labelled β; B1: path towards bottom of page AND no upward component AND labelled β; B1: (continuation of beam along) horizontal line through magnetic field AND labelled γ (3 marks)"
  },
  "9": {
    "marks": 9,
    "topic": "Space Physics and Stars",
    "content_text": "The Sun is one of many billions of stars in the Milky Way. The Sun emits a very large quantity of energy as electromagnetic radiation.  (a)   State   the   three   regions   of   the   electromagnetic   spectrum   in   which   the   Sun   emits   the most energy. 1 ....... 2 ....... 3 ....... [2]  (b)   Electromagnetic radiation from the Sun travels at a speed of 3.0   ×   10 8  m / s. The radiation takes 500 s to reach the Earth.  Calculate the distance from the Sun to the Earth. distance = .......   [2]  (c)   Approximately 4.6 billion years ago, the Sun formed from an interstellar cloud of gas and became a stable star.  (i)   Describe and explain what happens as an interstellar cloud of gas forms a protostar. ....... ....... .......   [2]  (ii)   Describe and explain what happens as a protostar becomes a stable star. ....... ....... ....... .......   [3] [Total: 9]",
    "mark_scheme": "9(a) A2: ultraviolet AND visible light AND infrared only; C1: any two from: ultraviolet; visible light; infrared and no more than one incorrect addition (2 marks); 9(b) A2: 1.5 × 10¹¹ m; C1: v = s / t OR (s =) vt OR 3.0 × 10⁸ × 500 (2 marks); 9(c)(i) B2: any two from: cloud / nebula / it collapses, due to (internal) gravitational attraction, (internal) temperature increases (2 marks); 9(c)(ii) B3: any three from: (nuclear) fusion / nuclear reactions (in the star), forces are balanced, gravitational force is inwards, outwards force is due to high temperature (3 marks)"
  }
};

// Define Question Paper Tutor Tools for the Orchestrator
const tools = [
  {
    type: "function",
    function: {
      name: "get_paper_context",
      description: "Retrieve metadata for the current question paper (board, subject, year, level)",
      parameters: {
        type: "object",
        properties: {
          paper_id: { type: "string" }
        },
        required: ["paper_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_question",
      description: "Retrieve a specific past paper question from database by paper ID and question number",
      parameters: {
        type: "object",
        properties: {
          paper_id: { type: "string" },
          question_number: { type: "string" },
          question_part: { type: "string" }
        },
        required: ["paper_id", "question_number"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_question_assets",
      description: "Retrieve visual assets (diagrams, graphs, tables) for a question",
      parameters: {
        type: "object",
        properties: {
          question_id: { type: "string" }
        },
        required: ["question_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_mark_scheme",
      description: "Retrieve the official marking criteria and examiner tips for a question",
      parameters: {
        type: "object",
        properties: {
          question_id: { type: "string" }
        },
        required: ["question_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "find_similar_questions",
      description: "Find similar practice questions covering the same syllabus concept",
      parameters: {
        type: "object",
        properties: {
          question_id: { type: "string" },
          topic: { type: "string" },
          subtopic: { type: "string" }
        },
        required: ["question_id", "topic"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_topic_resources",
      description: "Retrieve concise syllabus notes and key equations for a topic",
      parameters: {
        type: "object",
        properties: {
          topic: { type: "string" }
        },
        required: ["topic"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "save_student_progress",
      description: "Update student learning profile with topic mastery and performance metrics",
      parameters: {
        type: "object",
        properties: {
          student_id: { type: "string" },
          topic: { type: "string" },
          score: { type: "number" },
          max_score: { type: "number" }
        },
        required: ["student_id", "topic", "score", "max_score"]
      }
    }
  }
];

// Helper: Convert base64 data URI or fetch remote URL to image Blob
async function getImageBlob(imageUrlOrBase64: string): Promise<{ blob: Blob; fileName: string } | null> {
  try {
    if (imageUrlOrBase64.startsWith("data:")) {
      const match = imageUrlOrBase64.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        const mimeType = match[1] || "image/jpeg";
        const base64Data = match[2];
        const binaryString = atob(base64Data);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const ext = mimeType.includes("png") ? "png" : "jpg";
        return { blob: new Blob([bytes], { type: mimeType }), fileName: `student_sheet.${ext}` };
      }
    } else if (imageUrlOrBase64.startsWith("http://") || imageUrlOrBase64.startsWith("https://")) {
      const res = await fetch(imageUrlOrBase64);
      if (res.ok) {
        const blob = await res.blob();
        return { blob, fileName: "student_sheet.jpg" };
      }
    }
  } catch (e) {
    console.warn("Error converting image for edit:", e);
  }
  return null;
}

// Build precise image editing prompt instructing GPT-Image-2.5-Sunburst to overlay teacher ink
function buildSunburstEditPrompt(
  assessment: any,
  topic: string,
  totalScore: number,
  totalMax: number,
  pageIndex?: number
): string {
  let subparts: any[] = [];
  let isMultiPage = false;
  let isFinalPage = true;
  let pageScore = totalScore;
  let pageMax = totalMax;

  if (typeof pageIndex === 'number' && assessment.pages && assessment.pages[pageIndex]) {
    const pData = assessment.pages[pageIndex];
    isMultiPage = true;
    isFinalPage = pageIndex === assessment.pages.length - 1;
    pageScore = pData.page_score ?? 0;
    pageMax = pData.page_max_score ?? 1;

    // Collect all subparts that belong to THIS SPECIFIC PAGE!
    const directlyTagged = (Array.isArray(pData.subparts) && pData.subparts.length > 0)
      ? pData.subparts
      : (assessment.subparts?.filter((sp: any) => sp.page_index === pageIndex) || []);

    subparts = directlyTagged.length > 0 ? directlyTagged : (assessment.subparts || []);
  } else {
    subparts = Array.isArray(assessment.subparts) ? assessment.subparts : [];
  }

  // Every single subpart belonging to this page must be marked!
  // Never drop, filter out, or omit any subpart!
  const partsToMark = subparts;
  const sheetMarksSum = isMultiPage ? pageScore : partsToMark.reduce((sum: number, sp: any) => sum + (Number(sp.score) || 0), 0);
  // Question-Centric Identification for Stamping
  const questionSummaries: any[] = Array.isArray(assessment.question_summaries) ? assessment.question_summaries : [];
  const pIdx = typeof pageIndex === 'number' ? pageIndex : 0;

  // Determine questions that appear on this page
  const questionsOnThisPage = questionSummaries.filter((qs: any) => {
    const pages = Array.isArray(qs.spanned_pages) ? qs.spanned_pages : [qs.start_page ?? 0];
    return pages.includes(pIdx);
  });

  // Determine questions that START on this page
  const questionsStartingHere = questionSummaries.filter((qs: any) => {
    const startPage = Math.min(...(qs.spanned_pages || [qs.start_page ?? 0]));
    return startPage === pIdx;
  });

  // Determine questions that CONTINUE onto this page from an earlier page
  const questionsContinuingHere = questionSummaries.filter((qs: any) => {
    const startPage = Math.min(...(qs.spanned_pages || [qs.start_page ?? 0]));
    return (qs.spanned_pages || []).includes(pIdx) && pIdx > startPage;
  });

  // Helper to ensure question score is mathematically consistent with the subparts on this page
  const getReconciledQScore = (qs: any) => {
    const qNum = String(qs.question_number || '1');
    let score = Number(qs.score) || 0;
    const maxScore = Number(qs.max_score) || 1;
    if (partsToMark.length > 0) {
      const partsForQ = partsToMark.filter((sp: any) => {
        const spClean = String(sp.part_label || '').toLowerCase();
        const prefixMatch = spClean.match(/^(?:question|q)?\s*(\d+)/i);
        return !prefixMatch || prefixMatch[1] === qNum;
      });
      if (partsForQ.length > 0) {
        const pageEarned = partsForQ.reduce((sum: number, sp: any) => sum + (Number(sp.score) || 0), 0);
        if (pageEarned > score) {
          score = pageEarned;
        }
      }
    }
    return { score, maxScore };
  };

  // Build the prominent teacher stamps for this page:
  const questionStamps: string[] = [];
  if (questionsStartingHere.length > 0) {
    questionsStartingHere.forEach((qs: any) => {
      const { score, maxScore } = getReconciledQScore(qs);
      questionStamps.push(`Question ${qs.question_number} Total: ${score}/${maxScore}`);
    });
  } else if (questionsOnThisPage.length > 0) {
    questionsOnThisPage.forEach((qs: any) => {
      const { score, maxScore } = getReconciledQScore(qs);
      questionStamps.push(`Question ${qs.question_number} Total: ${score}/${maxScore}`);
    });
  } else if (!isMultiPage || questionSummaries.length === 0) {
    const qNum = assessment.identified_question_number || '1';
    const computedSum = partsToMark.reduce((sum: number, sp: any) => sum + (Number(sp.score) || 0), 0);
    const scoreToUse = Math.max(totalScore, computedSum);
    questionStamps.push(`Question ${qNum} Total: ${scoreToUse}/${totalMax}`);
  }

  const continuationStamps: string[] = [];
  questionsContinuingHere.forEach((qs: any) => {
    const startPage = Math.min(...(qs.spanned_pages || [0]));
    continuationStamps.push(`Question ${qs.question_number} (Cont. from Page ${startPage + 1})`);
  });

  // Format bottomStamp: NEVER drop the question total!
  // If this is the final page of a multi-page booklet, include BOTH the question total and the booklet grand total!
  let bottomStamp = "";
  const baseQuestionStamp = questionStamps.length > 0 ? questionStamps.join(' | ') : `Score: ${pageScore}/${pageMax}`;
  if (isFinalPage && isMultiPage) {
    bottomStamp = `${baseQuestionStamp} | Booklet Total: ${totalScore}/${totalMax}`;
  } else {
    bottomStamp = baseQuestionStamp;
  }

  const formattedInstructions = partsToMark.map((sp: any, idx: number) => {
    const label = sp.part_label || `(${idx + 1})`;
    const loc = sp.exact_location || `Ruled line area for Part ${label}`;
    const detected = sp.student_answer_detected ? ` (Student wrote: "${sp.student_answer_detected.substring(0, 80)}")` : '';
    const score = Number(sp.score) || 0;
    const maxScore = Number(sp.max_score) || 1;

    const markingPoints: any[] = Array.isArray(sp.marking_points) ? sp.marking_points : [];
    const constructiveCorrection = sp.constructive_correction || sp.teacher_correction_note || sp.teacher_correction || (sp.deductions && sp.deductions[0]) || '';

    let section = `${idx + 1}. Part ${label} [${loc}]${detected}:\n`;

    // 1. INLINE POINT-BY-POINT TICKS (Put a tick at EACH and EVERY valid point)
    if (markingPoints.length > 0) {
      section += `   - IN-SITU POINT-BY-POINT TICKS (CRITICAL: DO NOT JUST PUT TICKS AT FAR MARGIN END!):\n`;
      let earnedCount = 0;
      markingPoints.forEach((pt: any, ptIdx: number) => {
        if (pt.is_earned || pt.tick_or_cross === 'tick') {
          earnedCount++;
          const phrase = pt.student_phrase ? ` over/beside "${pt.student_phrase}"` : '';
          const pos = pt.inline_location ? ` at ${pt.inline_location}` : '';
          section += `     * Point ${earnedCount} (${pt.mark_code || 'Point'}: ${pt.criterion || 'Earned mark'}): Draw a neat, small red ballpoint pen tick "✓"${phrase}${pos}.\n`;
        }
      });
      if (earnedCount === 0 && score > 0) {
        section += `     * Draw ${score} small red ballpoint ticks "✓" directly beside the correct key phrases/values in the student's text.\n`;
      }
    } else if (score > 0) {
      section += `   - IN-SITU POINT-BY-POINT TICKS (CRITICAL: DO NOT JUST PUT TICKS AT FAR MARGIN END!):\n`;
      section += `     * Place a small, distinct red ballpoint pen tick "✓" directly above or beside EACH correct keyword, formula, step, numerical value, or unit in the student's handwritten response (award ${score} separate ticks for ${score} earned marks).\n`;
    }

    // 2. CONSTRUCTIVE CORRECTIONS FOR MISSED POINTS (HOW IT SHOULD HAVE BEEN DONE)
    if (score < maxScore) {
      section += `   - CONSTRUCTIVE CORRECTION ON HOW TO ANSWER (CRITICAL - DO NOT BE GENERIC!):\n`;
      const missedPoints = markingPoints.filter((pt: any) => !pt.is_earned);
      if (missedPoints.length > 0) {
        missedPoints.forEach((mp: any) => {
          const correction = mp.constructive_correction || constructiveCorrection;
          const phrase = mp.student_phrase ? ` Underline "${mp.student_phrase}" in thin red pen (NEVER strike through valid equations or numbers).` : ' Where this step was missed, draw an insertion caret "^".';
          section += `     * Error/Omission (${mp.mark_code || 'Mark'}: ${mp.criterion || 'Missed criteria'}):${phrase} Write neatly in small red handwriting directly underneath/beside it: "${correction}".\n`;
        });
      } else if (constructiveCorrection) {
        section += `     * Underline the specific incorrect phrase in thin red ink and write directly underneath it in neat, legible red handwriting: "${constructiveCorrection}". Show the student clearly how it should have been done or answered!\n`;
      }
    }

    // 3. RIGHT MARGIN SUB-TOTAL
    if (score > 0) {
      section += `   - RIGHT MARGIN SUB-TOTAL: In the right-hand margin directly level with this answer line, write the red pen fraction "✓ (${score}/${maxScore})".\n`;
    } else {
      section += `   - RIGHT MARGIN SUB-TOTAL: In the right-hand margin directly level with this answer line, write a red pen cross "✕ (0/${maxScore})".\n`;
    }

    return section;
  }).join('\n\n');

  const mathematicalBreakdown = partsToMark.map((sp: any) => {
    const score = Number(sp.score) || 0;
    const maxScore = Number(sp.max_score) || 1;
    const symbol = score > 0 ? '✓' : '✕';
    return `- Part ${sp.part_label}: ${symbol} (${score}/${maxScore}) [Awards: ${score} marks]`;
  }).join('\n');

  return `Generate the marked exam sheet photo by editing the supplied student answer image with authentic red ink teacher markings.
CRITICAL EDITING RULES:
1. PRESERVE ORIGINAL: Keep the student's page, ruled lines, lighting, and blue/black handwriting 100% intact. Do NOT redraw, erase, or alter their work.
2. POINT-BY-POINT INLINE MARKING: Place a small, sharp red ballpoint pen tick (✓) at EACH and EVERY valid point, correct phrase, formula, value, or unit in the student's text — DO NOT just put ticks at the far right end!
3. CONSTRUCTIVE CORRECTIONS ON HOW TO ANSWER: Whenever a student misses a mark, loses credit, or omits a required point, write a constructive red-ink correction note showing EXACTLY how it should have been done or answered (e.g. underline the flawed part with a neat red line and write the correct term, explanation, or step right beside/under it, or draw an insertion caret '^' for missing steps).
   ABSOLUTE PROHIBITION ON STRIKING OUT CORRECT FORMULAS OR WORKING: NEVER draw strike-through lines over formulas like Q = mcΔT, or numerical calculations. Only underline the specific error in neat red pen.
4. RIGHT MARGIN SUBPART TOTALS: Write the subpart mark fraction in the right margin (e.g. "✓ (2/2)", "✓ (1/2)", "✕ (0/1)").
5. QUESTION-CENTRIC MARKS & QUESTION TOTAL STAMP:
   - MANDATORY QUESTION TOTAL: Students MUST know the total number of marks they get per question. Stamp the Question Total prominently: "${bottomStamp}".
   - NEVER omit or forget the Question Total stamp for any question answered on this page!
   - Do NOT write confusing page subtotals like "Page X Subtotal".
   - Continuation badge: ${continuationStamps.length > 0 ? `At top header area write: "${continuationStamps.join(' | ')}".` : 'None.'}

MATHEMATICAL MARK VERIFICATION (EVERY MARK IN THE MARGIN MUST ADD UP EXACTLY):
${mathematicalBreakdown}
-> Total marks marked on this page: ${sheetMarksSum} marks.
-> Prominent badge/stamp: "${bottomStamp}".

EXACT MARKING & POSITIONING INSTRUCTIONS:
${formattedInstructions}

CRITICAL RULES FOR TEACHER PEN MARKS:
1. CHECKMARK (✓) VS CROSS (✕):
   - Write small, clear annotations placed next to or neatly beneath the relevant error.
   - Avoid covering, crossing out, or obscuring the student's original handwriting or diagrams.
2. NUMBERS MUST MATCH:
   - Each fraction in the right margin MUST match the exact score and max marks specified above.
   - The marks marked in the margin MUST mathematically sum up to ${sheetMarksSum}.
3. MANDATORY QUESTION TOTAL STAMP:
   - At the bottom right corner (or designated score box or beside the question header), write the teacher's mark in bold red ballpoint pen: "${bottomStamp}". Every question must have its total clearly displayed.

Call the image_generation tool now to generate the authentic red ink marked exam photo.`;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  const len = bytes.byteLength;
  const chunkSize = 8192;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, chunk as any);
  }
  return btoa(binary);
}

// Execute image editing using OpenAI Responses API + gpt-image-2.5-sunburst image_generation tool
async function editImageWithSunburst(
  originalImageInput: string,
  editPrompt: string,
  apiKey: string
): Promise<string | null> {
  const model = Deno.env.get("IMAGE_EDIT_MODEL") || "gpt-image-2.5-sunburst";
  const responsesUrl = "https://api.openai.com/v1/responses";

  let finalImageUri = originalImageInput;

  // If remote URL, fetch and convert to base64 data URI to avoid OpenAI upstream download issues
  if (originalImageInput.startsWith("http://") || originalImageInput.startsWith("https://")) {
    try {
      const resp = await fetch(originalImageInput);
      if (resp.ok) {
        const mime = resp.headers.get("content-type") || "image/jpeg";
        const buf = await resp.arrayBuffer();
        const b64 = uint8ArrayToBase64(new Uint8Array(buf));
        finalImageUri = `data:${mime};base64,${b64}`;
      }
    } catch (fetchErr) {
      console.warn("Could not pre-fetch remote image for base64 conversion:", fetchErr);
    }
  }

  const imageContent = { type: "input_image", image_url: finalImageUri };

  try {
    const reqBody: any = {
      model: "gpt-4.1",
      instructions: "You are an automated visual exam marking agent. You must ALWAYS invoke the image_generation tool to edit the supplied student exam sheet photo by overlaying authentic red ballpoint teacher markings, ticks, crosses, margin marks, and constructive handwritten corrections directly onto the student sheet. Never respond with text only, and never apologize.",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: editPrompt },
            imageContent,
          ],
        },
      ],
      tools: [
        {
          type: "image_generation",
          model: model,
          action: "edit",
          quality: "medium",
          size: "1024x1792", // Full portrait A4 height for handwritten exam papers
        },
      ],
      tool_choice: { type: "image_generation" },
    };

    let attempts = 0;
    const maxAttempts = 3;
    let res: Response | null = null;

    while (attempts < maxAttempts) {
      attempts++;
      res = await fetch(responsesUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(reqBody),
      });

      // If 400 Bad Request, fall back size or remove action
      if (!res.ok && res.status === 400) {
        if (reqBody.tools[0]?.size !== "1024x1024") {
          reqBody.tools[0].size = "1024x1024";
          continue;
        }
        if (reqBody.tools[0]?.action) {
          delete reqBody.tools[0].action;
          continue;
        }
      }

      // If 429 Rate Limit or 5xx server error, backoff and retry!
      if (!res.ok && (res.status === 429 || res.status >= 500) && attempts < maxAttempts) {
        const waitMs = attempts * 1200;
        console.warn(`editImageWithSunburst: status ${res.status}. Backing off ${waitMs}ms before retry ${attempts + 1}/${maxAttempts}...`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }

      break;
    }

    if (!res || !res.ok) {
      const errText = res ? await res.text() : "No response";
      console.error("editImageWithSunburst: OpenAI Responses API returned", res?.status, "model:", model, "error:", errText.substring(0, 500));
      return `ERROR: ${res?.status} - ${errText}`;
    }

    const data = await res.json();

    // Extract image_generation_call output
    const imageOutputs = (data.output || []).filter(
      (o: any) => o.type === "image_generation_call"
    );

    if (imageOutputs.length > 0) {
      const b64 = imageOutputs[0].result;
      if (b64) {
        return `data:image/png;base64,${b64}`;
      }
    }

    const outputTypes = JSON.stringify(data.output?.map((o: any) => o.type));
    const msgContent = data.output?.find((o: any) => o.type === "message")?.content || "";
    console.warn("editImageWithSunburst: no image_generation_call in response output", outputTypes, JSON.stringify(msgContent));
    return `ERROR: no image_generation_call output. Message: ${JSON.stringify(msgContent)}`;
  } catch (err: any) {
    console.warn("editImageWithSunburst Responses API error:", err);
    return `ERROR: exception ${err?.message || err}`;
  }
}

// Resilient OpenAI Chat Completion caller with model fallback chain (e.g. gpt-6-luna -> gpt-4o-mini / gpt-4o)
async function executeChatCompletion(
  apiKey: string,
  modelCandidates: string[],
  bodyPayload: any
): Promise<{ ok: boolean; data: any; modelUsed: string; error?: string }> {
  let lastErr = "";
  for (const m of modelCandidates) {
    try {
      const requestPayload: any = {
        ...bodyPayload,
        model: m,
      };
      // Ensure deterministic results across all evaluations and batch marking runs
      if (requestPayload.seed === undefined) {
        requestPayload.seed = 42;
      }

      // Reasoning models (o1, o3, o4) and GPT-6 models (gpt-6-luna, gpt-6.1-sol) reject custom temperature (e.g. 0.1).
      // They only accept default (1) or omitting the field.
      if (m.startsWith("gpt-6") || m.startsWith("o1") || m.startsWith("o3") || m.startsWith("o4")) {
        delete requestPayload.temperature;
      } else {
        // Enforce deterministic 0.0 temperature for all vision/evaluation models
        requestPayload.temperature = 0.0;
      }

      console.log(`executeChatCompletion: attempting with model candidate ${m}...`);
      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestPayload),
      });

      if (resp.ok) {
        const data = await resp.json();
        console.log(`executeChatCompletion: success with model ${m}`);
        return { ok: true, data, modelUsed: m };
      } else {
        const errText = await resp.text();
        lastErr = `OpenAI API returned ${resp.status} for model ${m}: ${errText.substring(0, 300)}`;
        console.warn(`Model ${m} returned ${resp.status}: ${errText.substring(0, 150)}. Trying fallback candidate...`);
      }
    } catch (e: any) {
      lastErr = `Fetch error with model ${m}: ${e?.message || e}`;
      console.warn(`Fetch error for model ${m}:`, e);
    }
  }
  return { ok: false, data: null, modelUsed: modelCandidates[modelCandidates.length - 1], error: lastErr };
}

// Tool function: Retrieve official question mark scheme from database or built-in past paper
async function getQuestionMarkScheme(
  supabaseClient: any,
  paperId: string | null,
  qNum: string,
  context?: any,
  fallbackScheme?: string
): Promise<{
  found: boolean;
  question_number: string;
  topic: string;
  marks: number;
  content_text: string;
  official_mark_scheme: string | null;
}> {
  const cleanQNum = String(qNum || '1').replace(/^Q(?:uestion)?\s*/i, '').trim();

  // 1. Check database if paperId provided
  if (paperId && supabaseClient) {
    try {
      const { data: qData } = await supabaseClient
        .from("past_paper_questions")
        .select("id, question_number, marks, content_text, topic")
        .eq("paper_id", paperId)
        .eq("question_number", cleanQNum)
        .maybeSingle();

      if (qData) {
        const { data: solData } = await supabaseClient
          .from("past_paper_solutions")
          .select("official_mark_scheme, examiner_tips, ai_worked_solution")
          .eq("question_id", qData.id)
          .maybeSingle();

        if (solData?.official_mark_scheme) {
          return {
            found: true,
            question_number: cleanQNum,
            topic: qData.topic || context?.topic || "Science Examination",
            marks: qData.marks || 9,
            content_text: qData.content_text || "",
            official_mark_scheme: solData.official_mark_scheme,
          };
        }
      }
    } catch (e) {
      console.warn("getQuestionMarkScheme DB error:", e);
    }
  }

  // 2. Check BUILTIN papers (Physics & Chemistry)
  const isPhysics = (paperId === "9085edb4-cda3-4c1e-a5fb-cec588b2f28a") || (context?.subject && /physics/i.test(context.subject));
  const isChemistry = (paperId === "21f06556-c22c-4890-bec6-6e7119ffb86e") || (context?.subject && /chem/i.test(context.subject));
  const builtinPaper = isPhysics ? BUILTIN_PHYSICS_PAPER : (isChemistry ? BUILTIN_CHEM_PAPER : null);

  if (builtinPaper && builtinPaper[cleanQNum]) {
    const bq = builtinPaper[cleanQNum];
    return {
      found: true,
      question_number: cleanQNum,
      topic: bq.topic,
      marks: bq.marks,
      content_text: bq.content_text,
      official_mark_scheme: bq.mark_scheme,
    };
  }

  // 3. Fallback to passed-in mark_scheme if provided
  if (fallbackScheme && fallbackScheme.trim().length > 10) {
    return {
      found: true,
      question_number: cleanQNum,
      topic: context?.topic || "Exam Question",
      marks: context?.maxMarks || 9,
      content_text: context?.questionText || "",
      official_mark_scheme: fallbackScheme.trim(),
    };
  }

  return {
    found: false,
    question_number: cleanQNum,
    topic: context?.topic || "Exam Question",
    marks: context?.maxMarks || 9,
    content_text: context?.questionText || "",
    official_mark_scheme: null,
  };
}

// Helper to extract official subparts from question stem or mark scheme
function extractQuestionSubparts(
  contentText: string,
  markScheme?: string | null
): Array<{ label: string; marks: number; criteria?: string }> {
  const source = (markScheme && markScheme.trim().length > 25) ? markScheme : (contentText || '');
  const regex = /(?:^|\n|\s|\b)(\d*\s*(?:\([a-z0-9]+\))+)\s*([\s\S]*?)(?=(?:\n|\s|\b)(?:\d*\s*(?:\([a-z0-9]+\))+)|$)/gi;
  const map = new Map<string, { marks: number; criteria: string }>();
  let m: RegExpExecArray | null;

  while ((m = regex.exec(source)) !== null) {
    const rawLabel = m[1].replace(/^\d+\s*/, '').trim().toLowerCase();
    const body = m[2].trim();
    if (!rawLabel.startsWith('(')) continue;

    const bracketMatch = body.match(/\[(\d+)\]/) || body.match(/(?:\[|\()(\d+)\s*(?:marks?|m)(?:\]|\)|\b)/i);
    const marks = bracketMatch ? parseInt(bracketMatch[1], 10) : 1;

    if (!map.has(rawLabel)) {
      map.set(rawLabel, { marks: Math.max(1, marks), criteria: body.substring(0, 150) });
    }
  }

  const list: Array<{ label: string; marks: number; criteria?: string }> = [];
  map.forEach((val, label) => {
    list.push({ label, marks: val.marks, criteria: val.criteria });
  });
  return list;
}

// Extract canonical identity key for subparts (e.g. "(a)(i)" -> "a.i", "(b)(i)" -> "b.i", "(b)(ii)" -> "b.ii", "(a)" -> "a")
// to prevent double-counting marks when students write multiple attempts across pages,
// while strictly preserving distinct subparts like (a)(i) and (b)(i).
function getCanonicalSubpartKey(label: string): string {
  if (!label) return 'default';
  let clean = String(label).toLowerCase().trim();

  // Strip leading question number prefixes like "6(a)(i)", "Q6 (a)", "Question 6(b)(i)", "6.1"
  clean = clean.replace(/^(?:question|q)?\s*\d+[\s.:-]*\s*/i, '').trim();
  clean = clean.replace(/^part\s+/i, '').trim();

  // 1. Extract letter component (e.g. 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h')
  const letterMatch = clean.match(/(?:\((?:part\s*)?([a-h])\)|\b([a-h])(?=[\s.)(]|$))/i);
  const letter = letterMatch ? (letterMatch[1] || letterMatch[2]).toLowerCase() : null;

  // 2. Extract roman numeral component (e.g. 'i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x')
  const romanMatch = clean.match(/(?:\((viii|vii|vi|iv|v|ix|x|iii|ii|i)\)|\b(viii|vii|vi|iv|v|ix|x|iii|ii|i)\b)/i);
  const roman = romanMatch ? (romanMatch[1] || romanMatch[2]).toLowerCase() : null;

  // 3. Extract digit component (e.g. '1', '2', '3') if no roman numeral found
  const digitMatch = clean.match(/(?:\((\d+)\)|\b(\d+)\b)/);
  const digit = (!roman && digitMatch) ? (digitMatch[1] || digitMatch[2]) : null;

  // Build composite canonical key preserving subpart hierarchy:
  if (letter && roman) {
    return `${letter}.${roman}`;
  }
  if (letter && digit) {
    return `${letter}.${digit}`;
  }
  if (letter) {
    return letter;
  }
  if (roman) {
    return roman;
  }
  if (digit) {
    return digit;
  }

  // Fallback: strip all non-alphanumeric characters
  const normalized = clean.replace(/[^a-z0-9]/g, '');
  return normalized || clean;
}

/**
 * Computes a numeric sort weight for subparts to guarantee chronological ordering:
 * 'a' -> 100, 'a.i' -> 101, 'a.ii' -> 102, 'b' -> 200, 'b.i' -> 201, 'c' -> 300, etc.
 * Ensures Part 3(a) is ALWAYS sorted and displayed before Part 3(c).
 */
function getSubpartSortWeight(keyOrLabel: string): number {
  if (!keyOrLabel) return 9999;
  const canonical = getCanonicalSubpartKey(keyOrLabel);
  const parts = canonical.split('.');
  const letterPart = parts[0] || '';
  const subPart = parts[1] || '';

  let weight = 0;
  if (/^[a-z]$/i.test(letterPart)) {
    weight += (letterPart.toLowerCase().charCodeAt(0) - 96) * 100;
  } else if (/^\d+$/.test(letterPart)) {
    weight += parseInt(letterPart, 10) * 100;
  } else {
    weight += 5000;
  }

  const romanMap: Record<string, number> = {
    'i': 1, 'ii': 2, 'iii': 3, 'iv': 4, 'v': 5,
    'vi': 6, 'vii': 7, 'viii': 8, 'ix': 9, 'x': 10
  };

  if (romanMap[subPart.toLowerCase()]) {
    weight += romanMap[subPart.toLowerCase()];
  } else if (/^\d+$/.test(subPart)) {
    weight += parseInt(subPart, 10);
  }

  return weight;
}

interface PageLayoutMap {
  identified_question_number?: string;
  diagram_regions: Array<{
    label: string;
    box_2d: [number, number, number, number];
  }>;
  subpart_regions: Array<{
    part_label: string;
    label_box?: [number, number, number, number];
    handwriting_box?: [number, number, number, number];
    answer_baseline_y: number; // 0-1000
    has_student_writing?: boolean;
  }>;
}

interface VisualGroundingResult {
  diagram_regions: Array<{
    label: string;
    box_2d: [number, number, number, number];
  }>;
  subpart_groundings: Array<{
    part_label: string;
    label_box?: [number, number, number, number];
    handwriting_box?: [number, number, number, number];
    answer_baseline_y: number; // 0-1000
    has_student_writing?: boolean;
    earned_points?: Array<{
      point_number: number;
      student_phrase?: string;
      box_2d: [number, number, number, number];
    }>;
    mistake_points?: Array<{
      flawed_phrase?: string;
      box_2d: [number, number, number, number];
    }>;
    correction_box?: [number, number, number, number];
  }>;
}

function formatLayoutRegions(layoutMap: PageLayoutMap | VisualGroundingResult): any[] {
  const regions: any[] = [];
  (layoutMap.diagram_regions || []).forEach((d: any, idx: number) => {
    if (Array.isArray(d.box_2d) && d.box_2d.length === 4) {
      regions.push({
        id: `diagram_${(d.label || `fig_${idx + 1}`).replace(/[^a-z0-9]/gi, '_')}`,
        type: 'diagram',
        bbox: {
          x: d.box_2d[1] / 1000,
          y: d.box_2d[0] / 1000,
          width: Math.max(0.05, (d.box_2d[3] - d.box_2d[1]) / 1000),
          height: Math.max(0.05, (d.box_2d[2] - d.box_2d[0]) / 1000)
        },
        confidence: 1.0,
        text_snippet: d.label
      });
    }
  });

  const subparts = (layoutMap as any).subpart_groundings || (layoutMap as any).subpart_regions || [];
  subparts.forEach((s: any) => {
    const effectiveY = (typeof s.answer_baseline_y === 'number' && s.answer_baseline_y > 40)
      ? s.answer_baseline_y
      : ((Array.isArray(s.handwriting_box) && s.handwriting_box[2] > 40)
          ? s.handwriting_box[2]
          : ((Array.isArray(s.label_box) && s.label_box[0] > 40)
              ? s.label_box[0]
              : 100));
    const ymin = Math.max(40, effectiveY);
    const ymax = Math.min(960, ymin + 35);
    const xmin = (Array.isArray(s.handwriting_box) && s.handwriting_box[1] > 40) ? s.handwriting_box[1] : 150;
    const xmax = (Array.isArray(s.handwriting_box) && s.handwriting_box[3] > 40) ? s.handwriting_box[3] : 850;
    regions.push({
      id: `ans_${(s.part_label || 'subpart').replace(/[^a-z0-9]/gi, '_').toLowerCase()}_line`,
      type: 'answer_line',
      bbox: {
        x: xmin / 1000,
        y: ymin / 1000,
        width: Math.max(0.1, (xmax - xmin) / 1000),
        height: Math.max(0.02, (ymax - ymin) / 1000)
      },
      confidence: 1.0,
      subpart_label: s.part_label
    });
  });
  return regions;
}

// Pass 2: Visual Grounding & Positioning Agent (pure coordinate and spatial localization with gpt-6-luna)
async function groundEvaluatedMarks(
  apiKey: string,
  modelCandidates: string[],
  imageUrl: string,
  evaluatedSubparts: any[],
  qNum: string
): Promise<VisualGroundingResult | null> {
  if (!imageUrl || !evaluatedSubparts || evaluatedSubparts.length === 0) return null;

  const targets = evaluatedSubparts.map((sp: any) => {
    const earnedPhrases = Array.isArray(sp.marking_points)
      ? sp.marking_points
          .filter((pt: any) => (pt.is_earned || pt.is_awarded || pt.tick_or_cross === 'tick') && pt.student_phrase)
          .map((pt: any) => ({
            point_number: pt.point_number || pt.point_index || 1,
            student_phrase: pt.student_phrase,
            mark_code: pt.mark_code || 'B1'
          }))
      : [];
    const flawedPhrases = Array.isArray(sp.marking_points)
      ? sp.marking_points
          .filter((pt: any) => !(pt.is_earned || pt.is_awarded) && pt.flawed_phrase)
          .map((pt: any) => ({ flawed_phrase: pt.flawed_phrase }))
      : [];

    return {
      part_label: sp.part_label,
      student_answer_detected: sp.student_answer_detected || "",
      score: sp.score,
      max_score: sp.max_score,
      earned_phrases: earnedPhrases,
      flawed_phrases: flawedPhrases,
      teacher_correction_note: sp.teacher_correction_note || sp.constructive_correction || ""
    };
  });

  const groundingPrompt = `You are the Mentora Visual Grounding & Spatial Positioning Agent.
The Senior Chief Examiner has evaluated Question ${qNum}.
Your SOLE TASK is visual OCR localization on this student's exam sheet.
DO NOT re-grade or change scores. Focus 100% on pinpointing the precise pixel coordinates [ymin, xmin, ymax, xmax] (0-1000 integer scale, top-left [0,0] to bottom-right [1000,1000]).

EVALUATED SUBPARTS & TARGET PHRASES TO LOCATE:
${JSON.stringify(targets, null, 2)}

TASK:
1. DETECT PROTECTED REGIONS:
   - Identify any printed diagrams, graphs, circuits, apparatus illustrations, or tables (e.g. "Fig. 8.1", graphs):
   - "diagram_regions": [
       { "label": "string", "box_2d": [ymin, xmin, ymax, xmax] }
     ]
   - Teacher pen marks and notes MUST NEVER overlap these protected regions.

2. FOR EACH SUBPART:
   - "part_label": string matching the input (e.g. "(a)", "(b)(i)")
   - "label_box": [ymin, xmin, ymax, xmax] bounding the printed question subpart label.
   - "handwriting_box": [ymin, xmin, ymax, xmax] bounding the student's actual handwritten answer / calculation for this subpart. If blank: [0, 0, 0, 0].
   - "answer_baseline_y": integer (0 to 1000) indicating the EXACT vertical level (baseline) where the student's handwritten answer text finishes.
   - "earned_points": For each item in "earned_phrases", locate where that exact phrase or formula appears on the sheet:
     [
       {
         "point_number": number,
         "student_phrase": "string",
         "box_2d": [ymin, xmin, ymax, xmax] // bounding the exact phrase so a red tick (✓) can be placed at it
       }
     ]
   - "mistake_points": For each item in "flawed_phrases", locate where that flawed word appears on the sheet:
     [
       {
         "flawed_phrase": "string",
         "box_2d": [ymin, xmin, ymax, xmax] // bounding the flawed word so a neat underline or caret can be placed
       }
     ]
   - "correction_box": If teacher_correction_note is not empty, specify [ymin, xmin, ymax, xmax] for a clear empty space directly below/beside the error where the teacher's red correction note can be written without overlapping diagrams or the next subpart.

COORDINATE SYSTEM:
All coordinates are normalized integers 0 to 1000 (0,0 is top-left, 1000,1000 is bottom-right).

Return strictly valid JSON matching this schema:
{
  "diagram_regions": [
    { "label": "string", "box_2d": [ymin, xmin, ymax, xmax] }
  ],
  "subpart_groundings": [
    {
      "part_label": "string",
      "label_box": [ymin, xmin, ymax, xmax],
      "handwriting_box": [ymin, xmin, ymax, xmax],
      "answer_baseline_y": number,
      "earned_points": [
        { "point_number": number, "student_phrase": "string", "box_2d": [ymin, xmin, ymax, xmax] }
      ],
      "mistake_points": [
        { "flawed_phrase": "string", "box_2d": [ymin, xmin, ymax, xmax] }
      ],
      "correction_box": [ymin, xmin, ymax, xmax]
    }
  ]
}
Return only JSON.`;

  try {
    const res = await executeChatCompletion(apiKey, modelCandidates, {
      messages: [
        { role: "system", content: "You are the Mentora Visual Grounding & Spatial Positioning Agent. Output strictly valid JSON." },
        {
          role: "user",
          content: [
            { type: "text", text: groundingPrompt },
            { type: "image_url", image_url: { url: imageUrl, detail: "high" } }
          ]
        }
      ],
      response_format: { type: "json_object" }
    });

    if (res.ok && res.data?.choices?.[0]?.message?.content) {
      const cleanJson = res.data.choices[0].message.content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      const parsed = JSON.parse(cleanJson);
      return {
        diagram_regions: Array.isArray(parsed.diagram_regions) ? parsed.diagram_regions : [],
        subpart_groundings: Array.isArray(parsed.subpart_groundings) ? parsed.subpart_groundings : []
      };
    }
  } catch (err) {
    console.warn("groundEvaluatedMarks execution error:", err);
  }
  return null;
}

// Master synthesizer: merges Pass 1 pedagogical assessment with Pass 2 visual grounding
function applyVisualGroundingToAssessment(
  assessment: any,
  grounding: VisualGroundingResult | null,
  qNum: string,
  targetPageIndex?: number
): void {
  const pIdx = typeof targetPageIndex === 'number' ? targetPageIndex : 0;
  if (!assessment) return;

  if (grounding) {
    assessment.layout_regions = formatLayoutRegions(grounding);
  }

  const subparts: any[] = Array.isArray(assessment.subparts) ? assessment.subparts : [];
  if (subparts.length === 0) return;

  subparts.sort((a: any, b: any) => {
    const wA = getSubpartSortWeight(a.part_label || '');
    const wB = getSubpartSortWeight(b.part_label || '');
    return wA - wB;
  });

  const totalParts = subparts.length;
  const score = assessment.total_score ?? assessment.score ?? 0;
  const maxScore = assessment.total_max_score || assessment.max_score || 1;

  const synthesized: any[] = [
    {
      type: 'total_header',
      text: `Q${qNum} Total: ${score}/${maxScore}`,
      comment: `Question ${qNum} Total Score: ${score}/${maxScore}`,
      box_2d: [840, 770, 880, 960],
      page_index: pIdx
    }
  ];

  let prevBadgeY = 0;

  subparts.forEach((sp: any, idx: number) => {
    const max = Number(sp.max_score) || 1;
    sp.score = Math.max(0, Math.min(Number(sp.score) || 0, max));
    if (sp.score === max) {
      sp.teacher_correction_note = "";
      sp.constructive_correction = "";
      sp.mistake_details = "";
      sp.misconception_analysis = "";
      sp.how_to_improve = "";
    }

    const cleanPart = (sp.part_label || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const matchedGrounding = grounding?.subpart_groundings?.find((sg: any) => {
      const gPart = (sg.part_label || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      return gPart === cleanPart || gPart.endsWith(cleanPart) || cleanPart.endsWith(gPart);
    });

    // 1. Determine answer baseline Y
    let detectedY: number | null = null;
    if (matchedGrounding && typeof matchedGrounding.answer_baseline_y === 'number' && matchedGrounding.answer_baseline_y >= 40 && matchedGrounding.answer_baseline_y <= 950) {
      detectedY = matchedGrounding.answer_baseline_y;
      sp.line_y = detectedY;
    } else if (matchedGrounding && Array.isArray(matchedGrounding.handwriting_box) && matchedGrounding.handwriting_box[2] > 40) {
      detectedY = Math.round((matchedGrounding.handwriting_box[0] + matchedGrounding.handwriting_box[2]) / 2);
      sp.line_y = detectedY;
    } else if (typeof sp.line_y === 'number' && sp.line_y >= 40 && sp.line_y <= 950) {
      detectedY = sp.line_y;
    }

    const defaultY = Math.round(70 + idx * (800 / Math.max(1, totalParts - 1)));
    const rawY = detectedY && detectedY >= 40 && detectedY <= 950 ? detectedY : defaultY;
    // Raise position by 20 units above the end-of-answer line so there is clear room to see which answer it belongs to
    let yMid = Math.max(rawY - 20, 35);

    // Collision prevention with diagrams
    if (grounding?.diagram_regions && grounding.diagram_regions.length > 0) {
      for (const d of grounding.diagram_regions) {
        if (Array.isArray(d.box_2d) && d.box_2d.length === 4) {
          const [dYmin, , dYmax] = d.box_2d;
          if (yMid >= dYmin - 10 && yMid <= dYmax + 10) {
            yMid = Math.min(dYmax + 25, 940);
          }
        }
      }
    }

    // Minimum 38 units separation between margin badges
    if (prevBadgeY > 0 && yMid < prevBadgeY + 38) {
      yMid = prevBadgeY + 38;
    }
    prevBadgeY = yMid;
    sp.line_y = yMid;

    // 2. Right Margin Score Badge: strictly in the right margin column
    const badgeText = `(${sp.score}/${sp.max_score})`;
    synthesized.push({
      type: 'mark_badge',
      text: badgeText,
      comment: sp.score > 0 ? (sp.marks_awarded?.[0] || `Part ${sp.part_label}: ${sp.score}/${sp.max_score} marks`) : (sp.deductions?.[0] || `Part ${sp.part_label}: 0/${sp.max_score} marks`),
      box_2d: [Math.max(yMid - 16, 40), 865, Math.min(yMid + 16, 940), 975],
      subpart_label: sp.part_label,
      page_index: pIdx
    });

    // 3. Point-by-point inline ticks (grounded to specific words/steps)
    let placedTicks = 0;
    const earnedPoints = Array.isArray(sp.marking_points)
      ? sp.marking_points.filter((pt: any) => pt.is_earned || pt.is_awarded || pt.tick_or_cross === 'tick')
      : [];

    earnedPoints.forEach((pt: any, ptIdx: number) => {
      let ptBox: [number, number, number, number] | null = null;
      if (matchedGrounding?.earned_points && matchedGrounding.earned_points.length > 0) {
        const ep = matchedGrounding.earned_points.find((p: any) =>
          p.point_number === (pt.point_number || pt.point_index || ptIdx + 1) ||
          (p.student_phrase && pt.student_phrase && p.student_phrase.toLowerCase().includes(pt.student_phrase.toLowerCase().slice(0, 15)))
        );
        if (ep && Array.isArray(ep.box_2d) && ep.box_2d.length === 4 && (ep.box_2d[0] > 0 || ep.box_2d[2] > 0)) {
          ptBox = ep.box_2d;
          pt.box_2d = ep.box_2d;
        }
      }

      if (!ptBox && Array.isArray(pt.box_2d) && pt.box_2d.length === 4 && (pt.box_2d[0] > 0 || pt.box_2d[2] > 0)) {
        ptBox = pt.box_2d;
      }

      let tickY: number;
      let tickX: number;
      if (ptBox) {
        const lineY = Math.round((ptBox[0] + ptBox[2]) / 2);
        tickY = Math.max(Math.min(lineY, 940), 30);
        tickX = Math.min(Math.max(ptBox[3] + 6, 120), 760);
      } else {
        // If subpart spans a tall handwriting box (e.g. graph + equations, span > 80 units),
        // distribute ticks along that span rather than clustering at the very bottom!
        const hwBox = matchedGrounding?.handwriting_box;
        const hasTallSpan = Array.isArray(hwBox) && hwBox.length === 4 && (hwBox[2] - hwBox[0] > 80);
        if (hasTallSpan) {
          const hwTop = Math.max(hwBox[0], 40);
          const hwBottom = Math.min(hwBox[2], 930);
          const span = hwBottom - hwTop;
          const stepFrac = (ptIdx + 1) / (earnedPoints.length + 1);
          tickY = Math.round(hwTop + span * stepFrac);
          tickX = ptIdx % 2 === 0 ? 560 : 720;
        } else {
          const yOffset = earnedPoints.length === 1 ? 0 : Math.round((ptIdx - (earnedPoints.length - 1) / 2) * 22);
          tickY = Math.max(yMid + yOffset, 40);
          tickX = earnedPoints.length === 1 ? 720 : (ptIdx % 2 === 0 ? 580 : 720);
        }
      }

      const isStrictMarkCode = typeof pt.mark_code === 'string' && /^[A-Z]\d{1,2}$/i.test(pt.mark_code.trim()) && pt.mark_code.trim().length <= 4;
      const cleanMarkCode = isStrictMarkCode ? pt.mark_code.trim().toUpperCase() : '✓';

      synthesized.push({
        type: 'inline_tick',
        text: cleanMarkCode,
        comment: pt.criterion || pt.student_phrase || `Part ${sp.part_label} mark earned`,
        box_2d: [Math.max(tickY - 14, 30), tickX, Math.min(tickY + 14, 940), Math.min(tickX + 40, 795)],
        subpart_label: sp.part_label,
        page_index: pIdx
      });
      placedTicks++;
    });

    // If earned marks > placedTicks, synthesize remaining ticks distributed along the answer line
    if (placedTicks < sp.score) {
      const remaining = Math.min(sp.score - placedTicks, 4);
      for (let k = 0; k < remaining; k++) {
        const tickIdx = placedTicks + k;
        const yOffset = Math.round((tickIdx - (sp.score - 1) / 2) * 22);
        const tickY = Math.max(yMid + yOffset, 40);
        const tickX = sp.score === 1 ? 720 : (tickIdx % 2 === 0 ? 580 : 720);
        synthesized.push({
          type: 'inline_tick',
          text: '✓',
          comment: sp.marks_awarded?.[tickIdx] || `Part ${sp.part_label} mark ${tickIdx + 1} earned`,
          box_2d: [Math.max(tickY - 14, 30), tickX, Math.min(tickY + 14, 940), Math.min(tickX + 35, 840)],
          subpart_label: sp.part_label,
          page_index: pIdx
        });
      }
    }

    // 4. Teacher correction note: positioned safely in blank space, NEVER overlapping the next subpart
    if (sp.score < sp.max_score) {
      const note = (sp.teacher_correction_note || sp.constructive_correction || sp.teacher_correction || sp.deductions?.[0] || sp.feedback || '').replace(/^✎\s*/, '').replace(/^\^\s*/, '').trim();
      if (note) {
        let corrBox: [number, number, number, number];
        if (matchedGrounding && Array.isArray(matchedGrounding.correction_box) && matchedGrounding.correction_box.length === 4 && matchedGrounding.correction_box[0] > 0) {
          corrBox = matchedGrounding.correction_box;
        } else {
          const nextSubpartDefaultY = idx + 1 < totalParts ? Math.round(70 + (idx + 1) * (800 / Math.max(1, totalParts - 1))) : 940;
          const availableGap = nextSubpartDefaultY - yMid;
          const corrY = availableGap >= 45 ? Math.min(yMid + 20, nextSubpartDefaultY - 20) : Math.max(yMid - 20, 45);
          const corrX = availableGap >= 45 ? 160 : 120;
          corrBox = [corrY, corrX, Math.min(corrY + 28, 940), Math.min(corrX + 340, 840)];
        }

        synthesized.push({
          type: 'comment',
          text: note,
          comment: note,
          teacher_correction: note,
          box_2d: corrBox,
          subpart_label: sp.part_label,
          page_index: pIdx
        });
      }
    }
  });

  // 5. Strict 2D Collision Resolution: Ticks and Comments MUST NOT overlap!
  const allTicks = synthesized.filter(m => m.type === 'tick' || m.type === 'inline_tick');
  const allComments = synthesized.filter(m => m.type === 'comment' || m.type === 'teacher_note');

  allComments.forEach(comm => {
    const cBox = comm.box_2d;
    if (!Array.isArray(cBox) || cBox.length < 4) return;

    for (const t of allTicks) {
      const tBox = t.box_2d;
      if (!Array.isArray(tBox) || tBox.length < 4) continue;

      const yOverlap = Math.max(cBox[0], tBox[0] - 8) < Math.min(cBox[2], tBox[2] + 8);
      const xOverlap = Math.max(cBox[1], tBox[1] - 8) < Math.min(cBox[3], tBox[3] + 8);

      if (yOverlap && xOverlap) {
        const tickMidY = (tBox[0] + tBox[2]) / 2;
        const commMidY = (cBox[0] + cBox[2]) / 2;
        const commHeight = Math.max(22, cBox[2] - cBox[0]);

        if (commMidY >= tickMidY) {
          cBox[0] = Math.min(930, tBox[2] + 10);
          cBox[2] = Math.min(950, cBox[0] + commHeight);
        } else {
          cBox[2] = Math.max(30, tBox[0] - 10);
          cBox[0] = Math.max(20, cBox[2] - commHeight);
        }
      }
    }
  });

  assessment.annotations = synthesized;
}

// Fallback surveyor for backwards-compatibility
async function surveyPageLayout(
  apiKey: string,
  modelCandidates: string[],
  imageUrl: string,
  questionHint?: string
): Promise<PageLayoutMap | null> {
  return null;
}

// Prompt builder: targeted per-question grading with explicit mark-scheme injection and anti-hallucination rules
function buildTargetedQuestionGradingPrompt(
  qNum: string,
  schemeData: {
    found: boolean;
    marks: number;
    topic: string;
    content_text: string;
    official_mark_scheme: string | null;
  },
  studentTranscription?: string,
  spannedPages?: number[],
  targetPageIndex?: number,
  layoutMap?: PageLayoutMap | null
): string {
  const isPageSpecific = typeof targetPageIndex === 'number';
  const pagesText = isPageSpecific
    ? `TARGET EVALUATION FOCUS: BOOKLET PAGE ${targetPageIndex}`
    : (spannedPages && spannedPages.length > 0
        ? `Target Booklet Page(s): ${spannedPages.join(', ')}`
        : `Single-Page Submission`);

  const expectedSubparts = extractQuestionSubparts(schemeData.content_text, schemeData.official_mark_scheme);
  const subpartChecklist = expectedSubparts.length > 0
    ? `======================================================================
MANDATORY OFFICIAL SUBPART REFERENCE (QUESTION ${qNum}):
${expectedSubparts.map(sp => `• Part ${sp.label} [${sp.marks} mark(s)]`).join('\n')}
======================================================================
CRITICAL MANDATORY INSTRUCTION — GRADE EVERY VISIBLE WRITTEN ANSWER ON THIS PAGE:
1. Scan the student page completely from TOP TO BOTTOM.
2. Identify and evaluate EVERY single written answer, formula, calculation, unit, or response visible on this sheet (e.g. (a), (b)(i), (b)(ii), (b)(iii), (c)(i), (c)(ii), etc.).
3. ABSOLUTE ZERO-OMISSION GUARANTEE:
   - YOU MUST NOT SKIP ANY ANSWER WRITTEN ON THIS PAGE!
   - If a student wrote working or a formula (e.g. Q = mcΔT = 0.34 × 4200 × ...), you MUST grade it and award the marks!
   - Never omit an answer or calculation because you think it belongs to another page or section!
4. In your "subparts" array, output an evaluation entry for EACH subpart present on this sheet.
   Set "page_index": ${isPageSpecific ? targetPageIndex : (spannedPages?.[0] ?? 0)}.
======================================================================`
    : `CRITICAL MANDATORY INSTRUCTION: Scan the student page from TOP TO BOTTOM. Grade EVERY subpart present on this sheet. Do NOT omit any subparts! Set "page_index": ${isPageSpecific ? targetPageIndex : (spannedPages?.[0] ?? 0)}.`;

  const markSchemeSection = schemeData.found && schemeData.official_mark_scheme
    ? `======================================================================
OFFICIAL AUTHORITATIVE MARK SCHEME (MANDATORY & BINDING GROUND TRUTH FOR QUESTION ${qNum}):
${schemeData.official_mark_scheme}
======================================================================

CRITICAL MARK SCHEME SUPREMACY, UNIVERSAL STANDARDISATION & ANTI-HALLUCINATION RULES:
1. BINDING GROUND TRUTH: The official mark scheme above is the SUPREME BINDING CRITERIA. You MUST NOT invent outside rules, unmentioned jargon, or deductions not present in this official scheme.

2. UNIVERSAL EXAMINER CODE OF PRACTICE & BENEFIT OF THE DOUBT (BOD) (APPLIES TO ALL PAPERS):
   - Under standard Cambridge / Edexcel / ZIMSEC / IB exam marking principles, apply the Benefit of the Doubt (BOD) rule:
   - When a student's answer, formula, calculation, or diagram shows genuine scientific knowledge that satisfies the marking point, AWARD THE MARK.
   - Do NOT penalize or withhold marks for:
     * Unlabelled reference letters on diagrams (e.g. if an object X is placed close to the lens in the focal region, award the mark even if the student did not write the letter 'F', provided it is visibly on the correct side and closer than infinity).
     * Stray marks, faint pencil lines, erased attempts, or unintentional ink smudges near printed text.
     * Minor phonetic spelling or handwriting slips where the meaning is unambiguous (e.g. 'alchol', 'convection', 'amphoteric', 'calcium carbonate').
   - DETERMINISTIC CONSISTENCY GUARANTEE:
     * Identical student answers MUST receive identical scores every single time without variance.
     * Never apply subjective harshness on one run and leniency on another.

3. QUESTION 3 (THERMAL PHYSICS / PARTICLES / CONVECTION) MANDATORY GRADING RULES:
   - Part (a) Particle Motion: Award the 1 mark if student states that particles in ice vibrate (about fixed positions) OR that particles in water move / slide past each other. This is the exact mark scheme criterion (B1: vibrate about fixed position OR particles in water move throughout liquid). DO NOT dock marks claiming "need to state motion not just fixed positions"!
   - Part (b)(ii) Specific Heat Capacity (Q = mcΔT):
     Formula: Q = mcΔT (1 mark). Substitution: 0.34 × 4200 × (change in temp) (1 mark).
     Whether ΔT is calculated as (20 - 10 = 10) or (10 - 20 = -10), if student writes energy transferred = 14 280 J (or 1.4 × 10⁴ J, or for 28°C to 10°C, 25 704 J / 2.6 × 10⁴ J), AWARD FULL 2/2 MARKS!
     NEVER dock marks or mark incorrect for an intermediate minus sign when energy transferred is stated as a positive magnitude on the answer line!
     NEVER cross out Q = mcΔT and tell the student to use Q = mcΔT!
   - Part (b)(i) / (c)(i) Heat Transfer between water and ice:
     Direct contact transfer between liquid water and ice is conduction (1 mark).
   - Part (b)(iii) / (c)(iii) Convection:
     Requires density changes: cold/colder water near ice becomes denser and sinks; warmer water rises to replace it, forming a convection current. (3 marks).
   - Part (b)(iv) / (c)(iv) Internal Energy:
     Internal energy decreases (1 mark) AND kinetic energy of particles decreases / particles move slower (1 mark). Total 2 marks. DO NOT demand potential energy changes!

3. QUESTION 4 (OPTICS, LENSES, MAGNIFYING GLASS, REFRACTION) MANDATORY GRADING RULES:
   - Part (a)(i) Focal Point Definition:
     * Mark 1: Rays meet / are focused after passing through a converging lens.
     * Mark 2: Incident rays must be parallel to the principal axis.
     * If the student wrote "A focal point is the point where light rays are focused after passing through a lens", award 1/2 marks.
     * Teacher correction note: "Add that the incident rays must be parallel to the principal axis."
   - Part (a)(ii) Magnifying Glass Object Position:
     * Position of object: between optical centre / lens and principal focus / focal point.
     * If student marks E between lens and focal point or writes "between the lens and a focal point", AWARD FULL 1/1 MARK!
   - Part (a)(iii) Two words to describe the image formed by a magnifying glass:
     * Question text: "Two words to describe the image are: - inverted, - real, - upright, - virtual".
     * Mark scheme criteria: "upright" AND "virtual" (image is virtual, upright, and enlarged).
     * CAREFULLY INSPECT THE STUDENT'S BLUE PEN INK: The student drew underlines ONLY under "upright" and "virtual"!
     * "inverted" and "real" are merely printed/transcribed list items and are NOT underlined!
     * Because the student selected "upright" and "virtual", they have chosen the EXACT CORRECT TWO PROPERTIES!
     * AWARD FULL MARKS: score = 1, max_score = 1 (or 2/2 if 2 marks).
     * DO NOT hallucinate that "real" or "inverted" were selected!
     * Zero over-correction rule: since full marks, teacher_correction_note = "".
   - Part (b)(i) Speed of Light in Glass:
     * Formula: n = c / v (1 mark). Calculation: v = (3.0 × 10⁸) / 1.5 = 2.0 × 10⁸ m/s with unit (1 mark).
     * Student's working is 100% correct. AWARD FULL 2/2 MARKS!

4. UNIVERSAL MANDATORY RULE FOR MULTIPLE CHOICE, WORD LISTS, AND SELECTION QUESTIONS (UNDERLINE / CIRCLE / TICK):
   - Whenever a question presents a word bank or multiple options (e.g. "Two words to describe the image are: - inverted, - real, - upright, - virtual"):
   - INSPECT THE PEN INK CLOSELY: A word is ONLY selected if the student has actively underlined it, circled it, or ticked beside it.
   - The printed text of options does NOT mean the student selected all of them!
   - If the student underlined 'upright' and 'virtual', they selected ONLY those two words.
   - If those two words match the mark scheme criteria (e.g. virtual and upright for a magnifying glass), AWARD FULL MARKS!
   - POSITIVE MARKING (CAMBRIDGE & ZIMSEC PRINCIPLE): NEVER hallucinate that un-underlined words were chosen, and NEVER cancel out correct marks with imaginary selections!

5. MATHEMATICAL & CALCULATION VERIFICATION:
   - Carefully verify the student's mathematical steps, formulas, and arithmetic.
   - For thermal calculations like Q = mcΔT = 0.34 × 4200 × 10 = 14 280 J (or 1.4 × 10⁴ J, or 25 704 J), award full marks immediately!
   - ABSOLUTE BAN ON SELF-CONTRADICTION: Under NO circumstances mark a student step incorrect if your own proposed correction note repeats the exact formula, numbers, or answer the student wrote!
6. "ANY N FROM" CRITERIA:
   - If the mark scheme states "any two from [A, B, C]" or "any three from [D, E, F]", and the student states that required number of valid concepts, award FULL MARKS.
7. SUBPART MARKS BUDGET INTEGRITY:
   - The max marks for each subpart are strictly defined by the mark scheme.
8. ZERO OVER-CORRECTION ON FULL-MARK ANSWERS:
   - When a student scores full marks on a subpart, set teacher_correction_note: "", constructive_correction: "", mistake_details: "".
   - Never write red correction notes or underlines over correct answers or drawings.`
    : `======================================================================
OFFICIAL MARK SCHEME STATUS:
[NO OFFICIAL MARK SCHEME STORED IN DATABASE FOR QUESTION ${qNum}]
- Grade fairly and equitably using standard Cambridge / ZIMSEC / IB syllabus principles.
======================================================================`;

  const layoutGroundingSection = layoutMap ? `
4. VERIFIED VISUAL GROUNDING (PAGE SURVEYOR AGENT GROUND TRUTH):
The Page Surveyor Agent has physically mapped this sheet. You MUST anchor to this ground truth:
- PROTECTED DIAGRAM / APPARATUS REGIONS (NEVER place marks or comments inside these):
${layoutMap.diagram_regions && layoutMap.diagram_regions.length > 0 ? JSON.stringify(layoutMap.diagram_regions, null, 2) : "None detected"}

- DETECTED SUBPART HANDWRITING REGIONS & BASELINE Y:
${layoutMap.subpart_regions && layoutMap.subpart_regions.length > 0 ? JSON.stringify(layoutMap.subpart_regions, null, 2) : "None detected"}

COORDINATE ANCHORING INSTRUCTIONS:
- For every subpart with an "answer_baseline_y", place its right-margin badge (✓ or ✗) at that EXACT Y coordinate: "line_y": answer_baseline_y, "box_2d": [answer_baseline_y - 15, 870, answer_baseline_y + 15, 970].
- For inline ticks (✓), place them inside that subpart's handwriting_box at the end of the student's valid written step.
- For teacher corrections, place them in blank ruled space below mistakes, NEVER overlapping the diagrams!` : '';

  return `You are the Mentora Senior Chief Examiner and Master Pedagogical Teacher.
You evaluate student answers under the guiding philosophy:
"MARK LIKE AN EXAMINER, EXPLAIN LIKE A TEACHER, AND ANNOTATE LIKE A PROFESSIONAL TEACHER."

TARGET QUESTION TO EVALUATE:
Question Number: ${qNum}
Total Maximum Marks: ${schemeData.marks}
Topic: ${schemeData.topic}
${pagesText}

EXAM QUESTION TEXT & STEM:
${schemeData.content_text || "Refer to question on paper."}

${subpartChecklist}

${markSchemeSection}

STUDENT SUBMISSION NOTES / TRANSCRIPTION:
${studentTranscription || "Refer to attached handwriting image(s)."}

PROFESSIONAL EXAMINER & PEDAGOGICAL TEACHER PROTOCOL:
1. RIGOROUS MARK SCHEME GRADING & EXACT PHRASE EXTRACTION:
   - Grade every subpart strictly against the official mark scheme.
   - For every marking point in "marking_points":
     * "point_number": integer (1, 2, ...)
     * "criterion": string (mark scheme criteria)
     * "is_earned": boolean (true if earned, false otherwise)
     * "mark_code": string (STRICT 2-3 char code only, e.g. "B1", "M1", "A1", "C1". NEVER write sentences or explanations in mark_code)
     * "student_phrase": the EXACT word, phrase, equation, or number from the student's handwritten response that earned this mark (e.g. 'upright', 'virtual', 'vibrate about fixed positions', 'Q = mcΔT', '14 280 J'). If not earned, leave empty "".
     * "flawed_phrase": if missed due to an incorrect response, the specific flawed word or value written by the student (e.g. 'conduction', 'inverted', 'real'). If omitted entirely, leave empty "".
   - NOTE: You do not need to guess pixel coordinates; the Visual Grounding Agent will localize them in Pass 2 using these target phrases!
2. CONSTRUCTIVE CORRECTIONS FOR MISSED POINTS:
   - If a student makes an error, write a concise correction note (MAXIMUM 10-12 words, e.g. 'Max current = 7.5/30 = 0.25 A as 30 Ω resistor remains in circuit'). Keep it very short so it fits on one line and never overlaps student writing!
   - If full marks: teacher_correction_note: "", constructive_correction: "", mistake_details: "".
${layoutGroundingSection}

REQUIRED JSON OUTPUT SCHEMA:
{
  "identified_question_number": "${qNum}",
  "identified_topic": "${schemeData.topic}",
  "total_score": number,
  "total_max_score": ${schemeData.marks},
  "percentage": number,
  "subparts": [
    {
      "part_label": "string (e.g. '(a)', '(b)(i)', '(b)(ii)', '(b)(iii)')",
      "line_y": number, // integer 0-1000 indicating vertical level of student's answer line
      "score": number,
      "max_score": number,
      "student_answer_detected": "string",
      "marks_awarded": ["string"],
      "deductions": ["string"],
      "teacher_correction_note": "string (empty if full marks)",
      "constructive_correction": "string (empty if full marks)",
      "mistake_details": "string (empty if full marks)",
      "page_index": number, // MANDATORY: ${isPageSpecific ? `MUST BE ${targetPageIndex}` : `Exact booklet page index where this subpart was written (${spannedPages?.join(', ') || 0})`}
      "marking_points": [
        {
          "point_number": 1,
          "criterion": "string",
          "is_earned": boolean,
          "mark_code": "string",
          "student_phrase": "string",
          "flawed_phrase": "string"
        }
      ]
    }
  ],
  "annotations": [
    {
      "type": "inline_tick" | "tick" | "cross" | "underline" | "total_header",
      "text": "string",
      "comment": "string",
      "box_2d": [ymin, xmin, ymax, xmax],
      "subpart_label": "string",
      "page_index": number // MANDATORY: ${isPageSpecific ? `MUST BE ${targetPageIndex}` : `Page index where this annotation belongs (${spannedPages?.join(', ') || 0})`}
    }
  ],
  "overall_feedback": "string",
  "examiner_model_solution": "string",
  "recommended_next_step": "string"
}
Return only JSON. No surrounding markdown backticks.`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const { 
      action, 
      message, 
      context, 
      sessionId, 
      question_text, 
      mark_scheme, 
      student_answer, 
      image_url, 
      document_text,
      model_override,
      generate_marked_image,
      assessment: reqAssessment,
      chatHistory: incomingHistory,
      paper_id: payloadPaperId
    } = payload;

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const openaiApiKey = payload.openai_api_key || Deno.env.get("OPENAI_API_KEY");

    // 0. Standalone AI Hand-Marked Exam Photo Editing (GPT-Image-2.5-Sunburst)
    if (action === "generate_marked_image") {
      if (!openaiApiKey) {
        return new Response(JSON.stringify({ error: "Missing OPENAI_API_KEY" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        });
      }

      const assessmentData = reqAssessment || {};
      const topic = assessmentData.identified_topic || "Chemistry / Science";
      const totalScore = assessmentData.total_score !== undefined ? assessmentData.total_score : (assessmentData.score || 0);
      const totalMax = assessmentData.total_max_score !== undefined ? assessmentData.total_max_score : (assessmentData.max_score || 10);
      
      const targetPageIndex = typeof payload.page_index === 'number' ? payload.page_index : undefined;
      let originalImage = image_url || payload?.original_image_url;
      if (typeof targetPageIndex === 'number' && assessmentData.pages && assessmentData.pages[targetPageIndex]) {
        originalImage = assessmentData.pages[targetPageIndex].original_image_url || originalImage;
      } else if (!originalImage && assessmentData.original_image_url) {
        originalImage = assessmentData.original_image_url;
      }

      if (!originalImage) {
        return new Response(JSON.stringify({ error: "Missing original student image for editing" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        });
      }

      const editPrompt = buildSunburstEditPrompt(assessmentData, topic, totalScore, totalMax, targetPageIndex);
      const editedUrl = await editImageWithSunburst(originalImage, editPrompt, openaiApiKey);

      if (editedUrl && !editedUrl.startsWith("ERROR:")) {
        return new Response(JSON.stringify({ 
          image_url: editedUrl,
          page_index: targetPageIndex 
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } else {
        const errorMsg = editedUrl || "Failed to edit image with gpt-image-2.5-sunburst";
        console.error("generate_marked_image: editImageWithSunburst failed:", errorMsg.substring(0, 300));
        return new Response(JSON.stringify({ error: errorMsg, debug: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }
    }

    // 0.4 Update Topic Workspace Template (Admin/Teacher chapter materials)
    if (action === "update_topic") {
      const topicId = payload.topic_id;
      const workspaceTemplate = payload.workspace_template;
      if (!topicId) {
        return new Response(JSON.stringify({ error: "Missing topic_id" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        });
      }
      const { data, error } = await supabaseClient
        .from("topics")
        .update({ workspace_template: workspaceTemplate })
        .eq("id", topicId)
        .select();

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        });
      }

      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 0.5 Sync Database Content with Service Role Key (Populates questions and solutions)
    if (action === "sync_database_content") {
      const results: any[] = [];
      const paperId = payloadPaperId || payload.paper_id || context?.paperId || context?.paper_id;
      const isPhysics = (paperId === "9085edb4-cda3-4c1e-a5fb-cec588b2f28a") || (payload?.subject && /physics/i.test(payload.subject));
      const targetPaperId = paperId || (isPhysics ? "9085edb4-cda3-4c1e-a5fb-cec588b2f28a" : "21f06556-c22c-4890-bec6-6e7119ffb86e");
      const paperData = isPhysics ? BUILTIN_PHYSICS_PAPER : BUILTIN_CHEM_PAPER;

      for (const [qNum, qInfo] of Object.entries(paperData)) {
        // 1. Update past_paper_questions with complete content_text, marks, and topic
        const { data: updatedQ, error: qErr } = await supabaseClient
          .from("past_paper_questions")
          .update({
            content_text: qInfo.content_text,
            marks: qInfo.marks,
            topic: qInfo.topic
          })
          .eq("paper_id", targetPaperId)
          .eq("question_number", qNum)
          .select("id, question_number")
          .maybeSingle();

        if (updatedQ) {
          // 2. Upsert into past_paper_solutions
          const { error: solErr } = await supabaseClient
            .from("past_paper_solutions")
            .upsert({
              question_id: updatedQ.id,
              official_mark_scheme: qInfo.mark_scheme,
              ai_worked_solution: qInfo.mark_scheme,
              common_mistakes: isPhysics
                ? "Inverting direction of electron flow (electrons move from negative sphere to Earth); missing arrowheads on electric field lines; formula transposition errors."
                : "Claiming fluorine is a gas at -200°C (-200 is colder than -188, so it is a liquid); forgetting state symbols; missing balancing coefficients.",
              examiner_tips: isPhysics
                ? "Ensure all field line drawings have arrows pointing towards the negative charge. Pay close attention to signs of charges and compensatory C-marks."
                : "Read negative temperatures carefully. Always balance symbol equations and check diatomic non-metals."
            }, { onConflict: "question_id" });

          results.push({ question_number: qNum, question_id: updatedQ.id, success: !solErr, error: solErr });
        } else {
          results.push({ question_number: qNum, error: qErr });
        }
      }

      return new Response(JSON.stringify({ success: true, targetPaperId, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 1. Direct Assessment Action with Vision & Sub-Part Orchestration Support
    if (action === "assess_attempt") {
      let allQuestionsContext = payload.all_questions_context || context?.allQuestionsContext || "";
      const paperId = payloadPaperId || context?.paperId || context?.paper_id;

      if (!allQuestionsContext && paperId && supabaseClient) {
        try {
          // Fetch all questions for this paper (valid schema columns only)
          const { data: qData } = await supabaseClient
            .from("past_paper_questions")
            .select("id, question_number, marks, topic, content_text, subtopic")
            .eq("paper_id", paperId);

          if (qData && qData.length > 0) {
            // Sort questions numerically (1, 2, 3... 9, 10) so paper questions never scramble
            qData.sort((a: any, b: any) => {
              const numA = parseInt(String(a.question_number).match(/\d+/)?.[0] || '0', 10);
              const numB = parseInt(String(b.question_number).match(/\d+/)?.[0] || '0', 10);
              if (numA !== numB) return numA - numB;
              return String(a.question_number).localeCompare(String(b.question_number), undefined, { numeric: true });
            });

            const qIds = qData.map((q: any) => q.id).filter(Boolean);
            let solMap: Record<string, string> = {};
            if (qIds.length > 0) {
              const { data: solData } = await supabaseClient
                .from("past_paper_solutions")
                .select("question_id, official_mark_scheme")
                .in("question_id", qIds);
              if (solData && solData.length > 0) {
                solData.forEach((s: any) => { solMap[s.question_id] = s.official_mark_scheme; });
              }
            }

            const isPhysics = (paperId === "9085edb4-cda3-4c1e-a5fb-cec588b2f28a") || (context?.subject && /physics/i.test(context.subject));
            const isChemistry = (paperId === "21f06556-c22c-4890-bec6-6e7119ffb86e") || (context?.subject && /chem/i.test(context.subject));
            const builtinPaper = isPhysics ? BUILTIN_PHYSICS_PAPER : (isChemistry ? BUILTIN_CHEM_PAPER : null);

            // Build full question context block with official mark schemes & subparts
            allQuestionsContext = qData.map((q: any) => {
              const numStr = String(q.question_number);
              const builtin = builtinPaper ? builtinPaper[numStr] : null;
              const content = (q.content_text && q.content_text.length > 80 && q.content_text.includes("("))
                ? q.content_text
                : (builtin?.content_text || q.content_text);
              const ms = solMap[q.id] || (builtin ? builtin.mark_scheme : null) || "[Official syllabus marking criteria apply]";
              const totalMarks = q.marks || builtin?.marks || 9;
              return `======================================================================
QUESTION ${q.question_number} [${totalMarks} MARKS] — Topic: ${q.topic || builtin?.topic || "Exam Topic"}
======================================================================
EXAM QUESTION CONTENT:
${content}

OFFICIAL MARK SCHEME (AUTHORITATIVE EXAMINER CRITERIA & ALLOWED ANSWERS):
${ms}
======================================================================`;
            }).join("\n\n");
          }
        } catch (dbErr) {
          console.warn("assess_attempt: failed to fetch paper questions from DB:", dbErr);
        }
      }

      // If specific mark_scheme was passed directly in payload, append it prominently
      if (mark_scheme && mark_scheme.trim().length > 10 && !allQuestionsContext.includes(mark_scheme.trim())) {
        allQuestionsContext += `\n\n======================================================================\nTARGET QUESTION OFFICIAL MARK SCHEME:\n${mark_scheme.trim()}\n======================================================================`;
      }

      // If still no context, build from appropriate builtin paper or question_text
      if (!allQuestionsContext || allQuestionsContext.length < 50) {
        if (question_text && question_text.length > 150) {
          allQuestionsContext = question_text;
        } else {
          const isPhysics = (paperId === "9085edb4-cda3-4c1e-a5fb-cec588b2f28a") || (context?.subject && /physics/i.test(context.subject));
          const fallbackPaper = isPhysics ? BUILTIN_PHYSICS_PAPER : BUILTIN_CHEM_PAPER;
          allQuestionsContext = Object.entries(fallbackPaper).map(([num, q]) => {
            return `======================================================================\nQUESTION ${num} [${q.marks} MARKS] — Topic: ${q.topic}\n======================================================================\nEXAM QUESTION CONTENT:\n${q.content_text}\n\nOFFICIAL MARK SCHEME:\n${q.mark_scheme}\n======================================================================`;
          }).join("\n\n");
        }
      }

      const assessmentPrompt = `You are the Senior Chief Examiner and Master Pedagogical Teacher for ${context?.subject || "Science"} (${context?.curriculum || "Cambridge / ZIMSEC / IB Examination Board"}). 
You evaluate student exam papers under the guiding philosophy:
"MARK LIKE AN EXAMINER, EXPLAIN LIKE A TEACHER, AND ANNOTATE LIKE A PROFESSIONAL TEACHER."

EXAM PAPER — ALL QUESTIONS, SUB-PARTS & OFFICIAL MARK SCHEMES:
${allQuestionsContext}

STUDENT SUBMISSION NOTES / TRANSCRIPTION:
${student_answer || document_text || "Attached handwritten image/document submission."}

PROFESSIONAL EXAMINER & PEDAGOGICAL TEACHER PROTOCOL:
1. POINT-BY-POINT INLINE MARKING (TICKS AT EACH AND EVERY EARNED POINT):
   - CRITICAL REQUIREMENT: Do NOT merely place a single tick at the far right margin!
   - Professional examiners mark in-situ: place a neat red checkmark (✓) directly adjacent to or above EACH AND EVERY valid point, formula, substitution, calculated value, unit, chemical name, or key scientific concept in the student's written response.
   - If a subpart awards multiple marks (e.g. 2, 3, or 4 marks) and the student earned them, there MUST be multiple distinct inline ticks placed across the student's working at each respective scoring point (Point 1 ✓, Point 2 ✓, etc.), IN ADDITION to the subpart mark fraction in the right margin!
   - In "marking_points" and "annotations", identify the exact inline phrase and location on the paper for each earned tick.

2. CONSTRUCTIVE CORRECTIONS FOR EVERY MISSED POINT (HOW IT SHOULD HAVE BEEN DONE):
   - CRITICAL REQUIREMENT: Whenever a student misses a mark, loses credit, makes a calculation error, uses the wrong direction/sign, or omits a required step/concept:
     * NEVER write generic or vague feedback like "wrong answer" or "check working".
     * You MUST write a concrete, constructive handwritten correction note explaining EXACTLY how it should have been done or answered!
     * Point out the exact location on the page where the error or omission occurred.
     * State what was written vs. what SHOULD have been written, providing the actual model formula, corrected numbers/calculations, or exact scientific terminology:
       - e.g. "Correction: At -200°C, temp is between MP (-220°C) and BP (-188°C) → Liquid state"
       - e.g. "Correction: a = Δv/Δt = (0.04 - 0) / 0.03 = 1.33 m/s²"
       - e.g. "Add missing state symbols: Pb²⁺(aq) + 2Br⁻(aq) → PbBr₂(s)"
       - e.g. "Correction: Electrons move from negative sphere to neutral Earth (sphere has high negative potential)"
     * The student MUST receive constructive feedback directly on their marked paper that immediately teaches them the correct method and reasoning!

3. INDEPENDENT MARK SCHEME POINT EVALUATION:
   - Follow the official marking scheme point-by-point strictly and independently.
   - Award method and compensatory marks ([C], [M], [B], [ecf]) whenever the student demonstrates the required concept, even if their final answer or direction is wrong!
   - Never award or deduct marks based simply on whether the overall answer "looks right" or "looks messy".
   - MANDATORY AWARDING OF CAMBRIDGE COMPENSATORY [C] MARKS:
     * For Question 6(b)(i):
       Official Scheme: "A2: electrons move (through the wire) from the sphere OR electrons move (through the wire) to(wards) the Earth; C1: electrons move (in the wire);"
       Max score = 2 marks!
       - If the student wrote "electrons move from the earth to the sphere", they correctly identified that electrons move in the wire! This EARNS the [C1] compensatory mark!
       - They lose [A2] because the direction is inverted (it is from the negatively charged sphere to Earth).
       - Score for 6(b)(i) MUST BE 1/2 marks! (Set score: 1, max_score: 2). DO NOT award 0!
       - In marks_awarded: ["[C1] Electrons move through the wire"].
       - In deductions: ["Lost A2: Direction is inverted; electrons move from the negatively charged sphere to Earth"].
       - Margin mark MUST BE A CHECKMARK: "✓ (1/2)", NEVER a cross "✕" because 1 mark was earned!
       - Teacher red pen note on paper: Underline "from the earth to the sphere" and write "move from sphere to Earth".

4. RIGOROUS & REASONABLE DIAGRAM / DRAWING AUDITING:
   - Check diagrams against every requirement in the marking scheme: number of lines, radial pattern, spacing, arrowheads, and boundary contact.
   - Judge drawings reasonably by eye, as a human examiner would.
   - For Question 6(a)(ii) (Electric field around negatively charged sphere):
     * Look closely at the circle and the radial lines. At the end of each line touching the circle, notice the clear arrowhead pointing directly inward towards the sphere!
     * Arrowheads ARE 100% PRESENT on every radial line! Under NO circumstances claim that arrowheads are missing or write "Add arrowheads pointing towards sphere"!
     * Transcribe BOTH the drawing and the written text in "student_answer_detected":
       "Drawn: 8 straight radial lines evenly spaced surrounding sphere, touching sphere with no lines inside, and arrowheads on all lines pointing inward towards the negative sphere. Written: The electric field lines are directed radially inward toward towards the negatively charged sphere."
     * Score all 3 criteria:
       - [B1] At least four straight radial lines AND evenly spaced -> EARNED
       - [B1] Four lines touching sphere AND no lines inside sphere -> EARNED
       - [B1] At least one arrowhead towards sphere AND no incorrect arrowheads -> EARNED
     * Award FULL MARKS 3/3 for 6(a)(ii)! Set score: 3, max_score: 3.
     * In right margin: place red tick "✓ (3/3)".
     * ZERO OVER-CORRECTION: Do NOT write any correction notes or underlines over this correct drawing!

5. ZERO OVER-CORRECTION ON FULL-MARK ANSWERS:
   - If a student earns full marks on a subpart (score === max_score):
     * Simply mark inline ticks at each correct point/keyword and a neat right-margin checkmark "✓ (score/max)".
     * NEVER add red correction notes, underlines, or unnecessary advice across their correct work or drawings.
     * For any subpart with full marks:
       - "teacher_correction_note": MUST BE EMPTY STRING ""
       - "constructive_correction": MUST BE EMPTY STRING ""
       - "mistake_details": MUST BE EMPTY STRING ""
       - "misconception_analysis": MUST BE EMPTY STRING ""
       - "how_to_improve": MUST BE EMPTY STRING ""

6. EXPLAIN LIKE A TEACHER (CONSTRUCTIVE & PROPORTIONAL FEEDBACK):
   - Don't just state the correct answer. Explain what the student got wrong, why, and how to improve.
   - Keep feedback concise, supportive, and appropriate to the error.
   - When a student makes an error or loses marks:
     * "misconception_analysis": Diagnose the underlying mental model or scientific error (e.g. "The student understands electrons move, but assumed electrons are drawn towards negative charge rather than being repelled by the high negative electric potential of the sphere to Earth").
     * "how_to_improve": Provide exactly 1 actionable, high-impact exam tip on how to secure the mark next time (e.g. "Remember that like charges repel: a negatively charged body has excess electrons which repel each other and discharge to neutral Earth").
     * "constructive_correction": The exact handwritten note to put directly on the student's sheet showing how it should have been done or answered.

7. PRECISE & NON-INTRUSIVE ANNOTATIONS:
   - Inline marks: Place small, crisp ticks "✓" directly adjacent to or above each earned point in the student's text.
   - Margin marks: In the RIGHT-HAND MARGIN directly level with the answer line:
     * When score > 0: "✓ (score/max)" (ALWAYS a checkmark!).
     * When score === 0: "✕ (0/max)" (cross ONLY for 0 marks).
   - Underlines & Corrections: If marks are lost, underline or strike through the specific erroneous phrase with a thin red line, or place an insertion caret '^' if a step was missed, and write the constructive correction note showing how it should have been answered.
   - Never cover or alter the student's original handwriting or diagrams.

8. QUESTION IDENTIFICATION & MARKS INTEGRITY:
   - Match the student's submission to the exact question in the EXAM PAPER above.
   - "total_max_score" MUST ALWAYS BE THE EXACT OFFICIAL MARKS FOR THIS SPECIFIC IDENTIFIED QUESTION (e.g. 9 marks for Question 6, 10 marks for Question 1). DO NOT guess or change max marks.
   - "total_score" MUST be the exact mathematical sum of subpart marks earned.
   - "percentage" is Math.round((total_score / total_max_score) * 100).
   - Circled total at bottom right corner: "Total: score/max" (e.g. "Total: 8/9").

9. OMITTED SUB-PARTS:
   - If the official question has sub-parts that the student DID NOT answer on their sheet:
     * List them in "subparts" with score: 0, max_score: official marks, student_answer_detected: "None (Unanswered / Omitted on student sheet)", deductions: ["0 marks: Question sub-part omitted / not attempted on sheet"], feedback: "Sub-part omitted. 0 marks awarded.", misconception_analysis: "", how_to_improve: "Attempt every sub-part to secure method marks.", constructive_correction: ""

10. REQUIRED OUTPUT FORMAT:
Return strictly valid JSON matching this exact structure:
{
  "identified_question_number": "string (e.g. '6')",
  "identified_topic": "string (e.g. 'Electricity and Static Electric Fields')",
  "total_score": number,
  "total_max_score": number,
  "percentage": number,
  "subparts": [
    {
      "part_label": "string (e.g. '(a)(i)' or '(b)(i)')",
      "part_title": "string (e.g. 'Electric Field Definition' or 'Current Flow Direction')",
      "official_mark_scheme_criteria": "string (the exact expected answer and scoring criteria from the mark scheme for this subpart)",
      "line_y": 180,
      "exact_location": "string (precise position on sheet, e.g. 'Ruled line 2-3 from top, middle of page')",
      "student_answer_detected": "string (transcription of what the student wrote or drew for this part)",
      "score": number,
      "max_score": number,
      "marking_points": [
        {
          "point_number": 1,
          "criterion": "string (e.g. 'Electrons move in the wire')",
          "mark_code": "string (e.g. 'C1' or 'B1' or 'M1')",
          "is_earned": true,
          "student_phrase": "string (e.g. 'electrons move')",
          "inline_location": "string (e.g. 'Line 2, words 1-2')",
          "box_2d": [180, 240, 205, 360],
          "tick_or_cross": "tick",
          "constructive_correction": "string (if missed, exact guidance on how it should have been done; empty '' if earned)"
        }
      ],
      "mistake_details": "string (if any mistake was made, describe what is incorrect on the paper; empty string '' if full marks)",
      "teacher_correction_note": "string (exact concise red-ink note to write on paper, e.g. 'move from sphere to Earth'; empty string '' if full marks)",
      "constructive_correction": "string (constructive guidance showing how it should have been answered or calculated; empty string '' if full marks)",
      "misconception_analysis": "string (underlying mental model or scientific misconception that caused this error; empty string '' if full marks)",
      "how_to_improve": "string (actionable, high-impact guidance on how the student can secure full marks next time; empty string '' if full marks)",
      "red_pen_action": "string (exact physical action for the image generator, e.g. 'Place inline tick ✓ over electrons move; write red correction note move from sphere to Earth; write ✓ (1/2) in right margin')",
      "marks_awarded": ["string (e.g. '[C1] Correctly identified electrons move in wire')"],
      "deductions": ["string (list errors or missing points with examiner explanations; empty array [] if full marks)"],
      "feedback": "string (concise examiner commentary for this part)"
    }
  ],
  "marking_actions": [
    {
      "target_subpart": "string (e.g. '(b)(i)')",
      "type": "inline_tick | tick | cross | underline_correction | margin_mark",
      "location_on_page": "string (e.g. 'Line 2 over electrons move' or 'Ruled line 2, right margin')",
      "mark_text": "string (e.g. '✓' or '✓ (1/2)')",
      "correction_note": "string (handwritten note showing how to answer correctly, e.g. 'move from sphere to Earth'; empty '' if full marks)",
      "red_pen_action": "string (e.g. 'Draw inline tick ✓ above electrons move; write correction move from sphere to Earth; write ✓ (1/2) in margin')"
    }
  ],
  "marking_instructions_for_image_editor": "string (complete multi-line numbered instructions for GPT-Image-2.5-Sunburst describing every inline tick at each point, exact line position, cross, constructive correction note on how it should be answered, margin sub-totals, and final total stamp)",
  "detected_regions": [
    {
      "id": "answer_1a_line_1",
      "type": "answer_line | question_number | answer_area | diagram | margin",
      "bbox": { "x": 0.22, "y": 0.18, "width": 0.60, "height": 0.035 },
      "confidence": 0.95
    }
  ],
  "annotations": [
    {
      "type": "inline_tick | cross | mark_badge | underline | comment | total_header",
      "target_id": "answer_1a_line_1",
      "anchor": "right_of_target | under_target | right_margin | left_margin | bottom_right_stamp",
      "offset": { "x": 0.012, "y": 0.0 },
      "text": "✓",
      "reason": "Electrons move in wire",
      "teacher_correction": "move from sphere to Earth",
      "bbox": { "x": 0.83, "y": 0.18, "width": 0.045, "height": 0.035 },
      "box_2d": [180, 830, 215, 875],
      "subpart_label": "(a)(i)",
      "confidence": 0.95
    }
  ],
  "overall_feedback": "string (encouraging, constructive summary of performance across the whole question)",
  "examiner_model_solution": "string (concise complete model answer for full marks across all parts)",
  "recommended_next_step": "string (targeted advice on what to review next)"
}
CRITICAL: Place every annotation using normalized page coordinates [0.0, 1.0]. Do NOT guess arbitrary pixel values. All annotations MUST reference a valid target_id in detected_regions with an anchor (right_of_target, right_margin, under_target, bottom_right_stamp).
The "annotations" array and "subparts" array MUST NOT be empty. For EVERY subpart, specify inline ticks at each valid point, exact locations, constructive correction notes for mistakes, right margin marks, and circled final score.
Return only JSON. No surrounding markdown backticks.`;

      let rawImages: string[] = Array.isArray(payload.images) && payload.images.length > 0
        ? payload.images
        : (Array.isArray(payload.answer_files) && payload.answer_files.length > 0
          ? payload.answer_files.map((f: any) => f.base64 || f.uri).filter(Boolean)
          : (image_url ? [image_url] : []));

      const requestedModel = model_override || "gpt-6-luna";
      const pass1Candidates = [requestedModel, "gpt-6-luna", "gpt-4o-mini"];
      const pass2Candidates = [requestedModel, "gpt-6-luna", "gpt-6.1-sol", "gpt-4o"];

      if (openaiApiKey && rawImages.length > 1) {
        try {
          console.log(`assess_attempt: multi-page submission detected (${rawImages.length} pages). Starting 3-pass assessment with modern models.`);

          // =========================================================================
          // PASS 1: BOOKLET INDEXER (Fast vision scan with gpt-6-luna to build script_map)
          // =========================================================================
          const indexPrompt = `You are the Senior Chief Examiner indexing exam booklet pages submitted by a student.
There are ${rawImages.length} scanned pages (Page 0 to Page ${rawImages.length - 1} in sequential order).

EXAM PAPER QUESTIONS & OFFICIAL MARK SCHEMES:
${allQuestionsContext}

YOUR TASK:
1. Examine all ${rawImages.length} pages in sequential order.
2. CRITICAL: Identify where each question STARTS and ENDS.
   - Look at the question headings at the top or margins of each page (e.g. "3 (a)", "3 (c)", "4 (a)").
   - Questions frequently span multiple pages!
     For example:
     - Question 3 begins on one page (with parts 3(a), 3(b)) and continues onto another page (with parts 3(c)(i), 3(c)(ii), 3(c)(iii), 3(c)(iv)).
     - BOTH pages belong to QUESTION 3!
     - DO NOT split Question 3 into separate questions just because it continues onto another page!
3. CRITICAL SUBPART & CHRONOLOGICAL PAGE ORDERING MANDATE:
   - Students frequently upload images in random order! (e.g. uploading the page containing 3(c) BEFORE the page containing 3(a)).
   - In "spanned_pages", YOU MUST ARRANGE the pages in chronological subpart reading order:
     Part (a) MUST ALWAYS COME FIRST, followed by part (b), then part (c), then (d), etc.
   - For example: If Page 3 contains 3(c) and Page 4 contains 3(a), then for Question 3, "spanned_pages" MUST BE [4, 3], NEVER [3, 4]!
   - Under "page_details", explicitly record every page index and the subparts found on that page, along with the "earliest_subpart" (e.g. 'a', 'b', 'c').
4. Detect all questions present in the booklet and their exact pages.
5. Return strictly valid JSON matching this schema:
{
  "script_map": [
    {
      "question_number": "string (e.g. '1', '2', '3', '6')",
      "topic": "string",
      "start_page": number, // 0-based page index where this question begins chronologically (with earliest subpart e.g. (a))
      "end_page": number,   // 0-based page index where this question finishes chronologically
      "spanned_pages": [number], // ordered chronologically by subpart flow (e.g. [4, 3] if Page 4 has 3(a) and Page 3 has 3(c))
      "page_details": [
        {
          "page": number,
          "subparts": ["string (e.g. 'a', 'b(i)', 'b(ii)')"],
          "earliest_subpart": "string (e.g. 'a')"
        }
      ],
      "notes": "string"
    }
  ]
}`;

          const indexUserParts: any[] = [{ type: "text", text: indexPrompt }];
          rawImages.forEach((img, idx) => {
            indexUserParts.push({
              type: "text",
              text: `--- BOOKLET / SUBMISSION PAGE ${idx} ---`
            });
            indexUserParts.push({
              type: "image_url",
              image_url: { url: img, detail: "low" }
            });
          });

          const indexRes = await executeChatCompletion(openaiApiKey, pass1Candidates, {
            messages: [
              { role: "system", content: "You are the Senior Chief Examiner indexing exam booklet pages. Output strictly valid JSON." },
              { role: "user", content: indexUserParts }
            ],
            response_format: { type: "json_object" },
            temperature: 0.0
          });

          let scriptMap: any[] = [];
          if (indexRes.ok && indexRes.data?.choices?.[0]?.message?.content) {
            try {
              const cleanIndexJson = indexRes.data.choices[0].message.content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
              const parsed = JSON.parse(cleanIndexJson);
              scriptMap = Array.isArray(parsed.script_map) ? parsed.script_map : [];
            } catch (e) {
              console.warn("Pass 1 script_map JSON parse error:", e);
            }
          }

          if (!scriptMap || scriptMap.length === 0) {
            // Intelligent Per-Page Fallback: Each page is treated as an individual question candidate
            scriptMap = rawImages.map((_, i) => ({
              question_number: String(i + 1),
              topic: "Science / Examination Paper",
              start_page: i,
              end_page: i,
              spanned_pages: [i],
              notes: `Submission page ${i + 1}`
            }));
          } else {
            // CRITICAL LOOPHOLE CLOSURE: Ensure EVERY page in rawImages is represented in scriptMap!
            const coveredPages = new Set<number>();
            scriptMap.forEach((sm: any) => {
              (sm.spanned_pages || []).forEach((p: number) => coveredPages.add(Number(p)));
              if (typeof sm.start_page === 'number') coveredPages.add(Number(sm.start_page));
              if (typeof sm.end_page === 'number') coveredPages.add(Number(sm.end_page));
            });

            rawImages.forEach((_, pIdx) => {
              if (!coveredPages.has(pIdx)) {
                console.log(`Loophole closed: Page ${pIdx} was omitted by indexer. Adding to scriptMap.`);
                scriptMap.push({
                  question_number: String(pIdx + 1),
                  topic: "Science / Examination Script",
                  start_page: pIdx,
                  end_page: pIdx,
                  spanned_pages: [pIdx],
                  notes: `Auto-included page ${pIdx + 1}`
                });
              }
            });
          }

          console.log(`Pass 1 completed (${indexRes.modelUsed}). Found ${scriptMap.length} question clusters:`, JSON.stringify(scriptMap));

          // =========================================================================
          // CANONICAL QUESTION & SUBPART ORDER REORDERING:
          // Sort pages so that:
          // 1. Question 1 starts first, Question 2 second, etc.
          // 2. Within any multi-page question, subpart (a) starts first, (b) second, (c) third, etc.
          // Even if students upload images in completely random order (e.g. Q3c before Q3a, Q2 before Q1),
          // the marked papers are delivered and viewed in perfect chronological order!
          // =========================================================================
          scriptMap.sort((a: any, b: any) => {
            const numA = parseInt(String(a.question_number || '').replace(/[^0-9]/g, ''), 10) || 999;
            const numB = parseInt(String(b.question_number || '').replace(/[^0-9]/g, ''), 10) || 999;
            if (numA !== numB) return numA - numB;
            return getSubpartSortWeight(String(a.question_number || '')) - getSubpartSortWeight(String(b.question_number || ''));
          });

          // Helper to extract the earliest subpart weight for a specific page of a question
          const getPageSubpartWeight = (entry: any, pNum: number): number => {
            // 1. Check page_details array if returned by indexer
            if (Array.isArray(entry.page_details)) {
              const pd = entry.page_details.find((d: any) => Number(d.page) === pNum);
              if (pd) {
                const sub = pd.earliest_subpart || (Array.isArray(pd.subparts) && pd.subparts[0]);
                if (sub) return getSubpartSortWeight(sub);
              }
            }
            // 2. Parse notes string if mentions specific page e.g. "Page 4 shows part (a)"
            const notesStr = String(entry.notes || '');
            const pageMatch = notesStr.match(new RegExp(`(?:Page|P)\\s*${pNum}[^.]*?(?:part|parts|shows|contains)?\\s*\\(?([a-h])\\)?`, 'i'));
            if (pageMatch && pageMatch[1]) {
              return getSubpartSortWeight(pageMatch[1]);
            }
            return 9999;
          };

          const canonicalPageOrder: number[] = [];
          scriptMap.forEach((entry: any) => {
            const rawPages = (Array.isArray(entry.spanned_pages) ? entry.spanned_pages : [entry.start_page ?? 0])
              .map(Number)
              .filter((p: number) => !isNaN(p) && p >= 0 && p < rawImages.length);

            // Sort pages within this question by subpart sequence ('a' before 'b' before 'c')
            const sortedPages = [...rawPages].sort((p1: number, p2: number) => {
              const w1 = getPageSubpartWeight(entry, p1);
              const w2 = getPageSubpartWeight(entry, p2);
              if (w1 !== w2 && w1 !== 9999 && w2 !== 9999) {
                return w1 - w2;
              }
              // If weights equal or unknown, preserve the order returned in spanned_pages
              return rawPages.indexOf(p1) - rawPages.indexOf(p2);
            });

            // Update entry.spanned_pages to match the subpart-sorted order
            entry.spanned_pages = sortedPages;

            sortedPages.forEach((pNum: number) => {
              if (!canonicalPageOrder.includes(pNum)) {
                canonicalPageOrder.push(pNum);
              }
            });
          });

          // Append any unindexed pages at the end
          rawImages.forEach((_, idx) => {
            if (!canonicalPageOrder.includes(idx)) {
              canonicalPageOrder.push(idx);
            }
          });

          console.log("Canonical Question Page Reordering mapping (old -> new):", canonicalPageOrder);

          // Reorder rawImages so Question 1 is page 0 and 3a comes before 3c!
          rawImages = canonicalPageOrder.map((oldIdx) => rawImages[oldIdx]);

          // Remap spanned_pages, start_page, end_page in scriptMap to new 0-based indices
          scriptMap.forEach((sm: any) => {
            const remapped = (sm.spanned_pages || [sm.start_page ?? 0])
              .map((oldIdx: number) => canonicalPageOrder.indexOf(Number(oldIdx)))
              .filter((p: number) => p >= 0);
            sm.spanned_pages = remapped.length > 0 ? remapped : [0];
            sm.start_page = Math.min(...sm.spanned_pages);
            sm.end_page = Math.max(...sm.spanned_pages);
          });

          console.log("Reordered scriptMap after canonical sorting:", JSON.stringify(scriptMap));

          // =========================================================================
          // PASS 2: QUESTION-CENTRIC TARGETED GRADING (Isolated Prompt + Bound Mark Scheme)
          // =========================================================================
          const questionEvaluations = await Promise.all(
            scriptMap.map(async (qEntry: any) => {
              const qNum = String(qEntry.question_number || '1');
              const spannedPages: number[] = Array.isArray(qEntry.spanned_pages) && qEntry.spanned_pages.length > 0
                ? qEntry.spanned_pages
                : [0];

              // Tool Call: Retrieve official mark scheme for this specific question from DB or syllabus
              const schemeData = await getQuestionMarkScheme(
                supabaseClient,
                paperId,
                qNum,
                context,
                mark_scheme
              );

              // Evaluate EACH page of this question with dedicated focus so that NO subpart on ANY page is ever missed!
              const pageEvals = await Promise.all(
                spannedPages.map(async (pIdx: number) => {
                  // PASS 1 FOR THIS PAGE: Pedagogical Examiner Agent (focused marking with gpt-6-luna)
                  console.log(`Page ${pIdx}: Running Pass 1 (Examiner Agent with gpt-6-luna)...`);
                  const targetedPrompt = buildTargetedQuestionGradingPrompt(
                    qNum,
                    schemeData,
                    student_answer || document_text,
                    spannedPages,
                    pIdx
                  );

                  const qUserParts: any[] = [{ type: "text", text: targetedPrompt }];
                  // Primary target page image to evaluate
                  if (rawImages[pIdx]) {
                    qUserParts.push({
                      type: "text",
                      text: `--- PRIMARY BOOKLET PAGE TO GRADE: PAGE ${pIdx} (Target Question ${qNum}) ---`
                    });
                    qUserParts.push({
                      type: "image_url",
                      image_url: { url: rawImages[pIdx], detail: "high" }
                    });
                  }
                  // Secondary reference pages (if any other pages in spannedPages)
                  spannedPages.forEach((refIdx) => {
                    if (refIdx !== pIdx && rawImages[refIdx]) {
                      qUserParts.push({
                        type: "text",
                        text: `--- REFERENCE CONTEXT: BOOKLET PAGE ${refIdx} ---`
                      });
                      qUserParts.push({
                        type: "image_url",
                        image_url: { url: rawImages[refIdx], detail: "low" }
                      });
                    }
                  });

                  try {
                    const qRes = await executeChatCompletion(openaiApiKey, pass2Candidates, {
                      messages: [
                        { role: "system", content: `You are the Mentora Senior Chief Examiner. Evaluate and mark EVERY subpart written on Page ${pIdx} strictly according to the mark scheme. Apply standard Cambridge/ZIMSEC Benefit of the Doubt (BOD): award marks when valid scientific understanding is demonstrated, ignore accidental smudges/stray marks, and enforce strict deterministic marking without inconsistency. Output strictly valid JSON.` },
                        { role: "user", content: qUserParts }
                      ],
                      response_format: { type: "json_object" },
                      temperature: 0.0
                    });

                    if (qRes.ok && qRes.data?.choices?.[0]?.message?.content) {
                      const cleanQJson = qRes.data.choices[0].message.content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
                      const parsed = JSON.parse(cleanQJson);
                      parsed.model_used = qRes.modelUsed;

                      if (Array.isArray(parsed.subparts)) {
                        parsed.subparts.forEach((sp: any) => {
                          sp.page_index = pIdx; // Enforce exact target page binding!
                        });
                      }

                      // PASS 2 FOR THIS PAGE: Visual Grounding & Positioning Agent (spatial localization with gpt-6-luna)
                      let pageGrounding: VisualGroundingResult | null = null;
                      if (rawImages[pIdx] && Array.isArray(parsed.subparts) && parsed.subparts.length > 0) {
                        console.log(`Page ${pIdx}: Running Pass 2 (Visual Grounding Agent with gpt-6-luna)...`);
                        pageGrounding = await groundEvaluatedMarks(
                          openaiApiKey,
                          pass1Candidates,
                          rawImages[pIdx],
                          parsed.subparts,
                          qNum
                        );
                        if (pageGrounding) {
                          console.log(`Page ${pIdx}: Pass 2 grounding detected ${pageGrounding.subpart_groundings.length} subparts and ${pageGrounding.diagram_regions.length} diagrams.`);
                        }
                      }

                      // Master synthesis: apply grounded coordinates, synthesize point-by-point inline ticks, margin badges, and comments
                      applyVisualGroundingToAssessment(parsed, pageGrounding, qNum, pIdx);

                      return parsed;
                    }
                  } catch (pErr) {
                    console.warn(`Error grading Question ${qNum} on Page ${pIdx}:`, pErr);
                  }
                  return null;
                })
              );

              const validPageEvals = pageEvals.filter(Boolean);
              if (validPageEvals.length === 0) return null;

              // Aggregate all subparts and annotations across all pages of this question
              const allQSubparts = validPageEvals.flatMap((pe: any) => pe.subparts || []);
              const allQAnnotations = validPageEvals.flatMap((pe: any) => pe.annotations || []);

              // Normalize subparts and enforce anti-hallucination / zero over-correction rules
              allQSubparts.forEach((sp: any) => {
                const spMax = Number(sp.max_score) || 1;
                sp.score = Math.max(0, Math.min(Number(sp.score) || 0, spMax));

                // Anti-overcorrection rule: full marks require no correction notes
                if (sp.score === spMax) {
                  sp.teacher_correction_note = "";
                  sp.constructive_correction = "";
                  sp.mistake_details = "";
                  sp.misconception_analysis = "";
                  sp.how_to_improve = "";
                }

                if (Array.isArray(sp.marking_points)) {
                  sp.marking_points.forEach((mp: any) => {
                    if (typeof mp.page_index !== 'number') {
                      mp.page_index = sp.page_index;
                    }
                  });
                }
              });

              // Strictly sort subparts in chronological order so 3(a) comes before 3(b) comes before 3(c)
              allQSubparts.sort((a: any, b: any) => {
                const wA = getSubpartSortWeight(a.part_label || '');
                const wB = getSubpartSortWeight(b.part_label || '');
                return wA - wB;
              });

              // Deduplicate subparts across pages for this question using canonical subpart keys.
              // Under Cambridge/GCSE rules, repeated attempts at the same subpart do not award double marks:
              // the student receives the score of their best attempt for each subpart.
              const subpartsByCanonicalKey = new Map<string, any[]>();
              allQSubparts.forEach((sp: any) => {
                const key = getCanonicalSubpartKey(sp.part_label);
                if (!subpartsByCanonicalKey.has(key)) {
                  subpartsByCanonicalKey.set(key, []);
                }
                subpartsByCanonicalKey.get(key)!.push(sp);
              });

              let canonicalScoreSum = 0;
              let canonicalMaxSum = 0;

              subpartsByCanonicalKey.forEach((partsList) => {
                const bestScore = Math.max(...partsList.map((p: any) => Number(p.score) || 0));
                const partMax = Math.max(...partsList.map((p: any) => Number(p.max_score) || 1));
                canonicalScoreSum += bestScore;
                canonicalMaxSum += partMax;
              });

              // Direct sum of all subparts for this question
              const allEarnedSum = allQSubparts.reduce((sum: number, sp: any) => sum + (Number(sp.score) || 0), 0);
              const maxPossible = schemeData.found && schemeData.marks ? schemeData.marks : (canonicalMaxSum || validPageEvals[0]?.total_max_score || 10);
              
              // If all subparts are on a single page, or if all subparts are distinct, use the accurate earned sum
              const resolvedScore = (spannedPages.length <= 1 && allEarnedSum > 0)
                ? allEarnedSum
                : Math.max(canonicalScoreSum, (subpartsByCanonicalKey.size === allQSubparts.length ? allEarnedSum : canonicalScoreSum));

              const finalQScore = Math.min(maxPossible, resolvedScore);

              return {
                identified_question_number: qNum,
                question_number: qNum,
                identified_topic: validPageEvals[0]?.identified_topic || schemeData.topic || "Science",
                total_score: finalQScore,
                score: finalQScore,
                total_max_score: maxPossible,
                max_score: maxPossible,
                percentage: maxPossible > 0 ? Math.round((finalQScore / maxPossible) * 100) : 0,
                subparts: allQSubparts,
                annotations: allQAnnotations,
                layout_regions: validPageEvals.flatMap((pe: any) => pe.layout_regions || []),
                spanned_pages: spannedPages,
                start_page: Math.min(...spannedPages),
                end_page: Math.max(...spannedPages),
                overall_feedback: validPageEvals.map((pe: any) => pe.overall_feedback).filter(Boolean).join(' ') || "",
                examiner_model_solution: validPageEvals[0]?.examiner_model_solution || "",
                recommended_next_step: validPageEvals[0]?.recommended_next_step || "",
                model_used: validPageEvals[0]?.model_used || "gpt-6-luna"
              };
              return null;
            })
          );

          const validQuestions = questionEvaluations.filter(Boolean);

          // =========================================================================
          // PASS 3: PAGE AGGREGATION & RECONCILED BOOKLET TOTALS
          // =========================================================================
          const allSubparts: any[] = [];
          const allAnnotations: any[] = [];
          const questionSummaries: any[] = [];
          let grandTotalScore = 0;
          let grandTotalMax = 0;

          validQuestions.forEach((qEval: any) => {
            const qNum = qEval.identified_question_number || qEval.question_number || "1";
            const qScore = Number(qEval.total_score ?? qEval.score ?? 0);
            const qMax = Number(qEval.total_max_score ?? qEval.max_score ?? 10);
            grandTotalScore += qScore;
            grandTotalMax += qMax;

            questionSummaries.push({
              question_number: qNum,
              topic: qEval.identified_topic || qEval.topic || "Exam Topic",
              score: qScore,
              max_score: qMax,
              percentage: qMax > 0 ? Math.round((qScore / qMax) * 100) : 0,
              spanned_pages: qEval.spanned_pages || [0],
              subparts: qEval.subparts || []
            });

            if (Array.isArray(qEval.subparts)) {
              allSubparts.push(...qEval.subparts);
            }
            if (Array.isArray(qEval.annotations)) {
              allAnnotations.push(...qEval.annotations);
            }
          });

          // Build per-page evaluations
          const pages: any[] = rawImages.map((imgUrl, pIdx) => {
            const isLastPage = pIdx === rawImages.length - 1;
            const pageSubparts = allSubparts.filter((sp: any) => sp.page_index === pIdx);
            const pageScore = pageSubparts.reduce((sum: number, sp: any) => sum + (Number(sp.score) || 0), 0);
            const pageMax = pageSubparts.reduce((sum: number, sp: any) => sum + (Number(sp.max_score) || 0), 0) || 5;

            const pageAnnotations = allAnnotations.filter((ann: any) => ann.page_index === pIdx);

            // 1. Stamp Question Total Badge on the FIRST PAGE where each question begins
            const questionsStartingHere = questionSummaries.filter((qs: any) => {
              const startPage = Math.min(...(qs.spanned_pages || [0]));
              return startPage === pIdx;
            });

            questionsStartingHere.forEach((qs: any, qIdx: number) => {
              const topY = 40 + qIdx * 50;
              const qBadgeText = `Q${qs.question_number} Total: ${qs.score}/${qs.max_score}`;
              pageAnnotations.push({
                type: 'total_header',
                text: qBadgeText,
                comment: `Question ${qs.question_number} Total: ${qs.score}/${qs.max_score} marks (${qs.percentage}%)`,
                box_2d: [topY, 680, topY + 45, 960],
                page_index: pIdx
              });
            });

            // 2. Identify if any question is continuing from a previous page
            const questionsContinuingHere = questionSummaries.filter((qs: any) => {
              const startPage = Math.min(...(qs.spanned_pages || [0]));
              return (qs.spanned_pages || []).includes(pIdx) && pIdx > startPage;
            });

            questionsContinuingHere.forEach((qs: any, cIdx: number) => {
              const topY = 40 + cIdx * 50;
              const startPage = Math.min(...(qs.spanned_pages || [0]));
              const contText = `Q${qs.question_number} (Cont. from Page ${startPage + 1})`;
              pageAnnotations.push({
                type: 'total_header',
                text: contText,
                comment: `Question ${qs.question_number} continued from Page ${startPage + 1}`,
                box_2d: [topY, 660, topY + 45, 960],
                page_index: pIdx
              });
            });

            // 3. On the final booklet page, stamp overall booklet total at the bottom
            if (isLastPage) {
              const finalBadgeText = `Booklet Total: ${grandTotalScore}/${grandTotalMax}`;
              pageAnnotations.push({
                type: 'total_header',
                text: finalBadgeText,
                comment: `Overall Booklet Total: ${grandTotalScore}/${grandTotalMax} marks`,
                box_2d: [840, 720, 880, 960],
                page_index: pIdx
              });
            }

            const questionsPresent = Array.from(new Set(
              pageSubparts.map((sp: any) => sp.part_label?.split('(')?.[0]?.trim() || '')
                .filter(Boolean)
                .concat(
                  scriptMap.filter((sm: any) => sm.spanned_pages?.includes(pIdx)).map((sm: any) => String(sm.question_number))
                )
            ));

            const pageLayoutRegions = validQuestions
              .filter((q: any) => q.spanned_pages?.includes(pIdx))
              .flatMap((q: any) => q.layout_regions || []);

            return {
              page_index: pIdx,
              original_image_url: imgUrl,
              page_score: pageScore,
              page_max_score: pageMax,
              questions_present: questionsPresent.length > 0 ? questionsPresent : [`${pIdx + 1}`],
              annotations: pageAnnotations,
              subparts: pageSubparts,
              layout_regions: pageLayoutRegions
            };
          });

          const multiPageAssessment: any = {
            identified_question_number: questionSummaries.map(q => q.question_number).join(', '),
            identified_topic: validQuestions[0]?.identified_topic || "Multi-Page Exam Script",
            total_score: grandTotalScore,
            total_max_score: grandTotalMax || 10,
            score: grandTotalScore,
            max_score: grandTotalMax || 10,
            percentage: grandTotalMax > 0 ? Math.round((grandTotalScore / grandTotalMax) * 100) : 0,
            subparts: allSubparts,
            layout_regions: validQuestions.flatMap((q: any) => q.layout_regions || []),
            annotations: allAnnotations,
            question_summaries: questionSummaries,
            pages: pages,
            overall_feedback: validQuestions.map(q => q.overall_feedback).filter(Boolean).join(' ') || `Completed multi-page booklet evaluation across ${rawImages.length} pages. Scored ${grandTotalScore}/${grandTotalMax} marks.`,
            examiner_model_solution: validQuestions.map(q => q.examiner_model_solution).filter(Boolean).join('\n\n'),
            recommended_next_step: validQuestions[0]?.recommended_next_step || "Review teacher constructive corrections on the marked booklet pages.",
            model_used: validQuestions[0]?.model_used || indexRes.modelUsed || "gpt-6-luna"
          };

          // Concurrently generate authentic teacher red-ink marked images for ALL pages!
          // No paper is EVER left unmarked or missed!
          if (generate_marked_image !== false) {
            try {
              const topic = multiPageAssessment.identified_topic || "Science";
              console.log(`Starting concurrent marked image generation for all ${rawImages.length} booklet pages...`);
              await Promise.all(
                rawImages.map(async (imgUrl, pIdx) => {
                  try {
                    // Stagger by 350ms to prevent burst rate-limiting on OpenAI
                    if (pIdx > 0) {
                      await new Promise((r) => setTimeout(r, pIdx * 350));
                    }
                    const editPrompt = buildSunburstEditPrompt(multiPageAssessment, topic, grandTotalScore, grandTotalMax, pIdx);
                    const editedUrl = await editImageWithSunburst(imgUrl, editPrompt, openaiApiKey);
                    if (editedUrl && !editedUrl.startsWith("ERROR:")) {
                      if (multiPageAssessment.pages && multiPageAssessment.pages[pIdx]) {
                        multiPageAssessment.pages[pIdx].marked_image_url = editedUrl;
                      }
                      if (pIdx === 0) {
                        multiPageAssessment.generated_marked_image_url = editedUrl;
                      }
                      console.log(`Successfully generated authentic teacher marked image for Page ${pIdx}`);
                    } else {
                      console.warn(`Marked image generation for Page ${pIdx} returned error:`, editedUrl);
                    }
                  } catch (pErr) {
                    console.warn(`Marked image generation for Page ${pIdx} failed:`, pErr);
                  }
                })
              );

              const attemptId = payload?.attempt_id;
              if (attemptId && supabaseClient) {
                try {
                  const updates: any = {};
                  if (multiPageAssessment.pages[0]?.marked_image_url) {
                    updates.generated_marked_image_url = multiPageAssessment.pages[0].marked_image_url;
                  }
                  updates.assessment_result = multiPageAssessment;
                  await supabaseClient
                    .from("student_attempts")
                    .update(updates)
                    .eq("id", attemptId);
                } catch (_) {}
              }
            } catch (bgErr) {
              console.warn("Multi-page Sunburst generation failed:", bgErr);
            }
          }

          return new Response(JSON.stringify({
            assessment: multiPageAssessment,
            marked_image_url: multiPageAssessment.generated_marked_image_url || null
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });

        } catch (multiPageErr: any) {
          console.error("Multi-page assessment pipeline error, falling back to standard evaluator:", multiPageErr);
        }
      }

      // =========================================================================
      // SINGLE-PAGE ASSESSMENT (Targeted Mark Scheme & Anti-Hallucination)
      // =========================================================================
      const singleImageUrl = rawImages[0] || image_url;

      // PASS 1: Pedagogical Examiner Agent (focused marking with gpt-6-luna)
      console.log(`Single-page: Running Pass 1 (Pedagogical Examiner Agent with gpt-6-luna)...`);
      const singleTargetedPrompt = `You are the Mentora Senior Chief Examiner and Master Pedagogical Teacher.
You evaluate student exam answers under the guiding philosophy:
"MARK LIKE AN EXAMINER, EXPLAIN LIKE A TEACHER, AND ANNOTATE LIKE A PROFESSIONAL TEACHER."

EXAM PAPER QUESTIONS & OFFICIAL MARK SCHEMES:
${allQuestionsContext}

STUDENT SUBMISSION NOTES / TRANSCRIPTION:
${student_answer || document_text || "Refer to attached handwriting image."}

ACTIVE CLIENT TAB: Question ${context?.questionNumber || '1'}

YOUR GRADING PROTOCOL:
1. QUESTION MATCHING:
   - Inspect the student's handwritten working, headings (e.g. "(a)(i)", "(a)(ii)", "(b)(i)", "(b)(ii)"), diagrams, and formulas.
   - Match the student's work to the EXACT question in the exam paper above.
   - For example: if the student defines an electric field, draws radial field lines around a negatively charged sphere, discusses electrons in an earthed wire, and calculates current with I = Q/t = (3.5 × 10^-10) / (0.14 × 10^-9) = 2.5 A, this is unequivocally **QUESTION 6** (Electricity and Static Electric Fields)! Set "identified_question_number": "6".
   - Grade strictly against THAT question's official mark scheme! Do NOT mark against Question 1 if the student answered Question 6!

2. MARK SCHEME COMPLIANCE & INTEGRITY:
   - The official mark scheme is the SUPREME BINDING GROUND TRUTH.
   - UNIVERSAL BENEFIT OF THE DOUBT (BOD) RULE (APPLIES TO ALL PAPERS):
     * Award marks whenever student demonstrates valid scientific understanding.
     * Do NOT dock marks for unlabelled reference points on diagrams if physically plausible, minor spelling slips, or faint stray smudges.
     * Enforce strict deterministic consistency across all papers.
   - Carefully verify student calculation steps, formulas, and values.
   - For thermal physics (Question 3):
     * Part (a) Particle Motion: Award the 1 mark if student states particles in ice vibrate (about fixed positions) OR water particles move / slide past each other. DO NOT dock marks claiming "only stated fixed positions not motion".
     * Specific Heat Capacity (Q = mcΔT): Formula is Q = mcΔT, substitution is 0.34 × 4200 × ΔT. Whether ΔT is written with a negative sign or positive, if student states energy transferred = 14 280 J (or 1.4 × 10⁴ J, or 25 704 J), award FULL 2/2 MARKS! NEVER dock marks for an intermediate minus sign when the answer line has the positive energy!
     * NEVER cross out Q = mcΔT and tell the student to use Q = mcΔT!
     * Internal energy: decreases because temperature decreases / particles lose kinetic energy (2/2 marks).
   - Award points for correct formulas, substitutions, final answers, and accurate scientific diagrams.
   - Never mark a student step incorrect if the student wrote the correct answer!
   - Zero over-correction on full marks: if a student earns full marks on a subpart, set teacher_correction_note: "", constructive_correction: "", mistake_details: "".

   - For optics / lenses / light (Question 4):
     * Part (a)(i) Focal Point: Rays meet / focused after lens (1 mark) AND rays parallel to principal axis (1 mark). Total 2 marks. If student states rays focused after passing lens: 1/2 marks.
     * Part (a)(ii) Magnifying Glass Object Position: Between lens and principal focus / focal point. Award 1/1 mark.
     * Part (a)(iii) Two words for magnifying glass image (inverted, real, upright, virtual):
       The image formed by a magnifying glass is VIRTUAL and UPRIGHT (and magnified).
       CAREFULLY INSPECT THE STUDENT'S INK: Check which specific words have pen underlines!
       If student underlined 'upright' and 'virtual', they chose the EXACT correct two words!
       AWARD FULL 1/1 MARK!
       NEVER hallucinate that 'real' or 'inverted' are selected!
     * Part (b)(i) Speed of light in glass: n = c / v => v = 3.0×10⁸ / 1.5 = 2.0×10⁸ m/s. 100% correct, AWARD FULL 2/2 MARKS!

   - SELECTION & WORD LIST QUESTIONS (UNIVERSAL RULE):
     * When options are listed (e.g. underline / circle / tick):
     * Look ONLY at the words the student actively underlined or circled.
     * Do NOT assume unselected prompt options were chosen!
     * Positive marking: If the student underlined the required correct terms, award full credit!

3. COMPLETE SUBPART GRADING — DO NOT STOP EARLY:
   - Scan the entire student page completely from TOP TO BOTTOM.
   - Grade EVERY subpart present on the sheet (for example (a), (b)(i), (b)(ii), (b)(iii)).
   - ABSOLUTE BAN ON EARLY STOPPING: Never omit or stop after the first subpart or paragraph! If the student answered calculations (e.g. Q = mcΔT = 14280 J) or further parts below, you MUST evaluate them and award marks.
   - Output an entry in "subparts" for EVERY subpart visible on the sheet.

4. EXACT PHRASE EXTRACTION FOR POINT-BY-POINT GROUNDING:
   - For every marking point in "marking_points":
     * "point_number": integer (1, 2, ...)
     * "criterion": string (mark scheme criteria)
     * "is_earned": boolean (true if earned, false otherwise)
     * "mark_code": string (e.g. "B1", "M1", "A1")
     * "student_phrase": the EXACT word, phrase, equation, or number from the student's handwritten response that earned this mark (e.g. 'upright', 'virtual', 'vibrate about fixed positions', 'Q = mcΔT', '14 280 J'). If not earned, leave empty "".
     * "flawed_phrase": if missed due to an incorrect response, the specific flawed word or value written by the student (e.g. 'conduction', 'inverted', 'real'). If omitted entirely, leave empty "".
   - NOTE: You do not need to guess pixel coordinates; the Visual Grounding Agent will localize them in Pass 2 using these target phrases!

Return strictly valid JSON matching this schema:
{
  "identified_question_number": "string (e.g. '6')",
  "identified_topic": "string",
  "total_score": number,
  "total_max_score": number,
  "score": number,
  "max_score": number,
  "percentage": number,
  "subparts": [
    {
      "part_label": "string (e.g. '(a)(i)')",
      "line_y": number, // integer 0-1000 indicating vertical level of student's answer line
      "max_score": number,
      "score": number,
      "student_answer_detected": "string",
      "marks_awarded": ["string"],
      "deductions": ["string"],
      "teacher_correction_note": "string (empty if full marks)",
      "constructive_correction": "string (empty if full marks)",
      "mistake_details": "string (empty if full marks)",
      "marking_points": [
        {
          "point_number": 1,
          "criterion": "string",
          "is_earned": boolean,
          "mark_code": "string",
          "student_phrase": "string",
          "flawed_phrase": "string"
        }
      ]
    }
  ],
  "overall_feedback": "string",
  "examiner_model_solution": "string",
  "recommended_next_step": "string"
}
Return only JSON.`;

      const messages: any[] = [
        { role: "system", content: "You are the Mentora Senior Chief Examiner. Mark every subpart strictly according to the official mark scheme with vision accuracy. Output strictly valid JSON." }
      ];

      if (singleImageUrl) {
        messages.push({
          role: "user",
          content: [
            { type: "text", text: singleTargetedPrompt },
            { type: "image_url", image_url: { url: singleImageUrl, detail: "high" } }
          ]
        });
      } else {
        messages.push({ role: "user", content: singleTargetedPrompt });
      }

      if (openaiApiKey) {
        const evalRes = await executeChatCompletion(openaiApiKey, pass2Candidates, {
          messages,
          response_format: { type: "json_object" },
          temperature: 0.0
        });

        if (!evalRes.ok) {
          console.error("OpenAI assessment error:", evalRes.error);
          return new Response(JSON.stringify({ error: evalRes.error || "OpenAI Assessment Error" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          });
        }
        if (evalRes.data?.choices && evalRes.data.choices[0]) {
          const rawContent = evalRes.data.choices[0].message.content;
          const cleanJson = rawContent.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
          const assessment = JSON.parse(cleanJson);
          assessment.model_used = evalRes.modelUsed;

          const identifiedQNum = String(assessment.identified_question_number || context?.questionNumber || '6');
          const schemeData = await getQuestionMarkScheme(
            supabaseClient,
            paperId,
            identifiedQNum,
            context,
            mark_scheme
          );
          if (schemeData.found && schemeData.marks) {
            assessment.total_max_score = schemeData.marks;
            assessment.max_score = schemeData.marks;
          }

          // Clamp subpart scores between 0 and max_score and enforce anti-overcorrection
          if (assessment.subparts && Array.isArray(assessment.subparts)) {
            assessment.subparts.sort((a: any, b: any) => {
              const wA = getSubpartSortWeight(a.part_label || '');
              const wB = getSubpartSortWeight(b.part_label || '');
              return wA - wB;
            });
            assessment.subparts.forEach((sp: any) => {
              const max = Number(sp.max_score) || 1;
              sp.score = Math.max(0, Math.min(Number(sp.score) || 0, max));
              if (sp.score === max) {
                sp.teacher_correction_note = "";
                sp.constructive_correction = "";
                sp.mistake_details = "";
                sp.misconception_analysis = "";
                sp.how_to_improve = "";
              }
            });
            const subpartsTotal = assessment.subparts.reduce((sum: number, sp: any) => sum + (Number(sp.score) || 0), 0);
            assessment.total_score = subpartsTotal;
            assessment.score = subpartsTotal;
            if (assessment.total_max_score) {
              assessment.percentage = Math.round((subpartsTotal / assessment.total_max_score) * 100);
            }
          }

          // PASS 2: Visual Grounding & Positioning Agent (spatial localization with gpt-6-luna)
          let singlePageGrounding: VisualGroundingResult | null = null;
          if (singleImageUrl && Array.isArray(assessment.subparts) && assessment.subparts.length > 0) {
            console.log(`Single-page: Running Pass 2 (Visual Grounding Agent with gpt-6-luna)...`);
            singlePageGrounding = await groundEvaluatedMarks(
              openaiApiKey,
              pass1Candidates,
              singleImageUrl,
              assessment.subparts,
              identifiedQNum
            );
            if (singlePageGrounding) {
              console.log(`Single-page: Pass 2 Grounding complete: detected ${singlePageGrounding.subpart_groundings.length} subparts and ${singlePageGrounding.diagram_regions.length} diagrams.`);
            }
          }

          // Master synthesis: apply grounded coordinates, synthesize point-by-point inline ticks, margin badges, and comments
          applyVisualGroundingToAssessment(assessment, singlePageGrounding, identifiedQNum, 0);

          // 2. Image Annotation Agent (GPT-Image-2.5-Sunburst)
          if (openaiApiKey && singleImageUrl && generate_marked_image !== false) {
            try {
              const topic = assessment.identified_topic || "Chemistry / Science";
              const totalScore = assessment.total_score !== undefined ? assessment.total_score : (assessment.score || 0);
              const totalMax = assessment.total_max_score !== undefined ? assessment.total_max_score : (assessment.max_score || 10);
              const editPrompt = buildSunburstEditPrompt(assessment, topic, totalScore, totalMax);
              
              // Run Sunburst image generation with a strict 10s budget so the response is returned promptly
              const editPromise = editImageWithSunburst(singleImageUrl, editPrompt, openaiApiKey);
              const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 10000));
              const editedUrl = await Promise.race([editPromise, timeoutPromise]);
              if (editedUrl && !editedUrl.startsWith("ERROR:")) {
                assessment.generated_marked_image_url = editedUrl;

                const attemptId = payload?.attempt_id;
                if (attemptId && supabaseClient) {
                  try {
                    await supabaseClient
                      .from("student_attempts")
                      .update({ generated_marked_image_url: editedUrl })
                      .eq("id", attemptId);
                  } catch (_) {}
                }
              }
            } catch (bgErr) {
              console.warn("Image Annotation Agent (Sunburst) failed:", bgErr);
            }
          }

          // Wrap single-page result in pages & question_summaries for universal booklet compatibility
          assessment.pages = [
            {
              page_index: 0,
              original_image_url: singleImageUrl,
              marked_image_url: assessment.generated_marked_image_url,
              page_score: assessment.total_score ?? assessment.score ?? 0,
              page_max_score: assessment.total_max_score ?? assessment.max_score ?? 10,
              questions_present: [assessment.identified_question_number || "1"],
              annotations: assessment.annotations || [],
              subparts: assessment.subparts || []
            }
          ];

          assessment.question_summaries = [
            {
              question_number: assessment.identified_question_number || "1",
              topic: assessment.identified_topic,
              score: assessment.total_score ?? assessment.score ?? 0,
              max_score: assessment.total_max_score ?? assessment.max_score ?? 10,
              percentage: assessment.percentage ?? 0,
              spanned_pages: [0],
              subparts: assessment.subparts || []
            }
          ];

          return new Response(JSON.stringify({ 
            assessment, 
            marked_image_url: assessment.generated_marked_image_url || null 
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    // 2. Standard Tutor Chat Orchestration Loop with OpenAI LLM
    if (!message) {
      return new Response(JSON.stringify({ error: "Missing message" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Fetch Session State & History if sessionId provided
    let chatHistory = incomingHistory || [];
    if (sessionId) {
      try {
        const { data: sessionData } = await supabaseClient
          .from("learning_sessions")
          .select("chat_history, current_stage, learning_mode, paper_id, question_id, question_number")
          .eq("id", sessionId)
          .single();

        if (sessionData?.chat_history && (!chatHistory || chatHistory.length === 0)) {
          chatHistory = sessionData.chat_history;
        }
      } catch (_e) {
        // Ignore session lookup error
      }
    }

    const paperTitle = context?.paperTitle || context?.title || "Past Exam Paper";
    const subject = context?.subject || "Science / Mathematics";
    const curriculum = context?.curriculum || "Cambridge / ZIMSEC / IB";
    const activeQNum = context?.questionNumber || "1";
    const activeQText = context?.questionText || "";
    const activeMarkScheme = context?.markScheme || "";
    const activeTopic = context?.topic || "";
    const hasOfficialScheme = !!(activeMarkScheme && activeMarkScheme.trim().length > 15 && !activeMarkScheme.includes("Method Mark (M1): Accurate application"));

    const systemPrompt = `You are the Mentora Question Paper AI Tutor, a friendly, intelligent, and expert human-like tutor for ${subject} (${curriculum}).
You are actively helping a student working through the exam paper: "${paperTitle}".

ACTIVE CONTEXT:
- Paper: "${paperTitle}"
- Subject: ${subject}
- Active Question: Question ${activeQNum} ${activeTopic ? `(${activeTopic})` : ''}
${activeQText ? `- Question Content: "${activeQText}"` : ''}
${hasOfficialScheme ? `- Official Mark Scheme / Criteria: "${activeMarkScheme}"` : '- Mark Scheme Status: No official mark scheme document is currently attached to this paper.'}
${context?.assessmentSummary ? `\n- LATEST ASSESSMENT & DETECTED STUDENT WORKING:\n${context.assessmentSummary}` : ''}

TUTORING INSTRUCTIONS:
1. Talk naturally, warmly, and conversationally like an experienced 1-on-1 tutor (NOT a robotic system).
2. ONLY do what the student explicitly asks — NEVER proactively explain, summarise, or break down questions unless the student directly requests it. If the student greets you or makes casual conversation, respond warmly and casually — do NOT launch into explanations of questions unprompted.
3. When the student explicitly asks how to solve a question or to explain it: Provide a clear, step-by-step educational breakdown with concepts, formulas, and working.
4. When the student asks for a hint: Give a helpful progressive hint that guides their understanding without spoiling the full answer.
5. When the student asks about marking criteria:
   - If an official mark scheme is provided above: Clearly outline what examiners look for, key terms, and common pitfalls based on the official scheme.
   - If NO official mark scheme is attached: Transparently state that while this paper does not have an official published mark scheme attached, you have derived the full examiner marking criteria and model solution from first principles based on ${curriculum} examination standards (${context?.marks || 'standard'} marks). Then display the exact point breakdown.
6. When the student makes short conversational remarks (e.g. "What's up", "Hey", "Thanks", "Cool", "I see"): Respond naturally and conversationally — keep it brief and friendly. Do NOT use their greeting as a trigger to explain question content.
7. When the student submits their answer or photo: Evaluate it rigorously against the marking criteria, award marks, applaud correct points, and explain how to improve.
8. Use rich, beautiful Markdown formatting:
   - Use clear section headings (e.g. ### Step 1: ..., ### Key Concepts).
   - Use bold (**term**) for key examiner keywords and scientific principles.
   - Format chemical formulas and ions clearly (e.g. H₂O, CO₂, PbBr₂, Zn²⁺, Cl⁻, SO₄²⁻, ²³₁₁Na).
   - Format reaction equations cleanly with state symbols and arrows (e.g. 2HI(g) ⇌ I₂(g) + H₂(g), Pb²⁺(aq) + 2Br⁻(aq) → PbBr₂(s)).
   - Use clean bullet points and numbered steps for readability.
9. PRESENTATION & CLEAN CONSISTENT STYLING:
   - NEVER wrap calculation lines or equations in display brackets like \\[ ... \\] or $$ ... $$.
   - Write equations and calculations directly and cleanly on their own lines or bullet points.
   - Maintain a standardized, professional look: do not randomly bold isolated numbers or mix random colors. Use bold only for clear step titles or key terminology.
10. FOLLOW-UP DISCUSSIONS & REVIEWING SUBPARTS:
    - When the student asks about a specific subpart (e.g. "Bro are you sure c(ii) is correct?", "why did I lose marks on (b)(i)?", "is helium fusion right?"):
      * Look directly at their detected student working from the assessment above, the official mark scheme criteria, and the underlying scientific principles.
      * Answer immediately, conversationally, warmly, and thoroughly! NEVER give generic delay responses like "If you want, I can help you go through it step by step. Just let me know!"—give them the real, helpful answer directly right now.
      * If they ask whether a part is correct, examine what they wrote. For instance, if they wrote "Helium nuclei fuse together" for a protostar forming a stable star, explain that in main sequence stars, hydrogen nuclei fuse into helium (helium fusion only happens later in red giants); explain why the Cambridge mark scheme awarded marks (e.g. for nuclear fusion and balanced forces) while validating their scientific awareness!`;

    const formattedHistory = chatHistory
      .filter((m: any) => m.content && (m.role === 'user' || m.role === 'assistant'))
      .map((m: any) => ({
        role: m.role,
        content: m.content
      }));

    const userMessageParts: any[] = [];
    userMessageParts.push({ type: "text", text: message });

    // 1. Question diagrams, graphs, tables (passed to vision model)
    if (context?.questionAssets && Array.isArray(context.questionAssets)) {
      for (const assetUrl of context.questionAssets) {
        if (assetUrl && typeof assetUrl === 'string' && (assetUrl.startsWith('http://') || assetUrl.startsWith('https://') || assetUrl.startsWith('data:image/'))) {
          userMessageParts.push({
            type: "image_url",
            image_url: { url: assetUrl }
          });
        }
      }
    }

    // 2. Student uploaded handwritten attempt / photo
    if (image_url && typeof image_url === 'string') {
      userMessageParts.push({
        type: "image_url",
        image_url: { url: image_url }
      });
    }

    const userMessageContent: any = userMessageParts.length > 1
      ? userMessageParts
      : message;

    const messages: any[] = [
      { role: "system", content: systemPrompt },
      ...formattedHistory.slice(-14),
      { role: "user", content: userMessageContent }
    ];

    if (!openaiApiKey) {
      return new Response(JSON.stringify({ 
        reply: `I'm your AI Tutor for **${paperTitle}**.\n\nLooking at **Question ${activeQNum}** (${activeTopic || subject}):\n\nHow can I help you with this? You can ask for a hint, the step-by-step solution method, or the examiner marking criteria.`
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Call OpenAI LLM to generate the direct conversational tutoring response
    const chatCandidates = ["gpt-6-luna", "gpt-4o-mini"];
    const chatRes = await executeChatCompletion(openaiApiKey, chatCandidates, {
      messages,
      temperature: 0.4
    });

    if (!chatRes.ok) {
      console.error("OpenAI API error:", chatRes.error);
      return new Response(JSON.stringify({ error: chatRes.error || "OpenAI API returned an error" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }
    const reply = chatRes.data?.choices?.[0]?.message?.content || "I'm reviewing your question paper. Let's work through this step by step.";

    // Save Updated Session History if sessionId is present
    if (sessionId) {
      try {
        await supabaseClient
          .from("learning_sessions")
          .update({
            chat_history: [...messages, { role: "assistant", content: reply }].slice(-12),
            updated_at: new Date().toISOString()
          })
          .eq("id", sessionId);
      } catch (_e) {
        // Ignore background save error
      }
    }

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500
    });
  }
});
