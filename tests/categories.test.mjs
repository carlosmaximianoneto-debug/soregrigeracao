import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createSeoRenderer} from '../seo-runtime.mjs';
const source=fs.readFileSync(new URL('../categories.js',import.meta.url),'utf8');
const context={window:{}};vm.runInNewContext(source,context);
const category=context.window.catalogueCategory;
const examples=[
 ['Esmerilhadeira Angular Bosch GWS 700 Professional 710W','Esmerilhadeiras'],
 ['Esmerilhadeira Angular Start 780W 115mm 11000RPM','Esmerilhadeiras'],
 ['Esmerilhadeira Angular com Disco de Corte','Esmerilhadeiras'],
 ['Jogo de 15 Brocas para Furadeira de Impacto','Brocas'],
 ['Broca SDS Plus para Martelete 10mm','Brocas'],
 ['Parafuso Auto Brocante Sextavado 5,5mm','Parafusos e fixadores'],
 ['Parafuso Autobrocante Phillips','Parafusos e fixadores'],
 ['Disco de Corte Diamantado para Esmerilhadeira','Discos e lâminas'],
 ['Serra Circular com Disco para Madeira','Serras elétricas'],
 ['Serra Tico-Tico 500W com Lâminas','Serras elétricas'],
 ['Serra-copo Diamantada 65mm','Serras-copo'],
 ['Furadeira de Impacto com Jogo de Brocas','Furadeiras e parafusadeiras'],
 ['Mangueira para Manifold 150cm','Mangueiras e conexões'],
 ['Mangueira para Gás Refrigerante R410A','Mangueiras e conexões'],
 ['Mangueira 5m para Lavadora Alta Pressão','Mangueiras e conexões'],
 ['Manifold com 3 Mangueiras R410A','Manifolds e manômetros'],
 ['Bomba de Dreno para Ar Condicionado','Bombas de dreno'],
 ['Bomba Lavadora para Limpeza de Ar Condicionado','Bombas de limpeza'],
 ['Acessórios Vacuômetro Digital: Conector T + Adaptador Curvo','Acessórios para medição'],
 ['Caixa Organizadora para Brocas e Parafusos','Maletas, bolsas e organização'],
 ['Kit Bits com Adaptador para Parafusadeira','Pontas, bits e mandris'],
 ['Mandril com Adaptador para Martelete','Pontas, bits e mandris'],
 ['Maçarico Portátil com Mangueira e Adaptador','Solda e maçaricos'],
 ['Óleo para Bomba de Vácuo 1L','Gases e óleos refrigerantes'],
 ['Bolsa Coletora para Limpeza de Ar Condicionado','Limpeza e higienização'],
 ['Alicate Amperímetro Digital','Multímetros e alicates amperímetros'],
 ['Kit Bomba de Vácuo com Manifold e Mangueiras','Bombas de vácuo'],
 ['Válvula para Bomba de Vácuo','Válvulas e núcleos'],
 ['Maleta Ferramenta Chave Soquete Completa','Chaves e alicates'],
 ['Kit Esmerilhadeira Angular DeWalt 800W + Disco Inox','Esmerilhadeiras'],
 ['Mini Esmerilhadeira 500w Com 8 Discos Azul-aço','Esmerilhadeiras'],
 ['Serra Mármore Concreto Profissional 1200w 4.3/8 Pol BTS1200','Serras elétricas'],
 ['Lâmina de Serra Sabre para Metal 150mm','Discos e lâminas'],
 ['Jogo com 15 Brocas Diamantadas 6-50mm Vidro Ceramica Piso','Brocas'],
 ['Broca Serra Copo Diamantada Alvenaria 53x150mm','Serras-copo'],
 ['Serra Copo Diamantada Compatível com Esmerilhadeira','Serras-copo'],
 ['Kit 03 Mangueiras Para Manifold R134a R22 R404 1.5 Metros','Mangueiras e conexões'],
 ['Conjunto de Mangueiras 2,50m Compatível Manifold R22 R134 R407','Mangueiras e conexões'],
 ['Kit 50un Reparo Vedação Borracha Mangueira Manifold 1/4','Mangueiras e conexões'],
 ['Porca Adaptador Para Cilindro Nitrogênio Manifold','Mangueiras e conexões'],
 ['Válvula Perfuradora Gás Refrigerante R134 R22 R404 1/4','Válvulas e núcleos'],
 ['Jogo 18 Bits para Parafusadeira Soquete Canhão Sextavado','Pontas, bits e mandris'],
 ['Kit 9 Ponta Bits Magnéticas K5 Ph2 Parafusadeira, Inclui 1 adaptador','Pontas, bits e mandris'],
 ['Adaptador Angular Imantado Encaixe Parafusadeira Ferramenta','Pontas, bits e mandris'],
 ['Ponta De Prova Multímetro Minipa MTL-18 Garra Jacaré 1000V 10A','Acessórios para medição'],
 ['Parafuso Auto Brocante 4,2x13 Ponta Broca 1000pçs','Parafusos e fixadores'],
 ['Kit Caixa Organizadora Ferramentas 27 Compartimentos Parafusos Brocas Bits','Maletas, bolsas e organização'],
 ['Bolsa Para Ferramentas De Lona Grossa Para Furadeira Resistente','Maletas, bolsas e organização'],
 ['Maleta Em Couro Especial Com Tranca E Chave N5','Maletas, bolsas e organização'],
 ['Chave 11mm Para Parafuso Do Suporte Condensadora Split','Chaves e alicates'],
 ['Kit Chave Inglesa Alicate Bomba Grifo Alicate Pressão','Chaves e alicates'],
 ['Gabarito Afiador de Broca Esmerilhadeira 125mm','Acessórios para perfuração e corte'],
 ['12 Acabamento Par Furo Da Serra-copo - Ar Condicionado Split','Acessórios para perfuração e corte'],
 ['Kit de 20 Sacos Coletores De Pó Para Brocas Até 65mm','Acessórios para perfuração e corte'],
 ['Kit 20 Sacos Coletores De Pó Para Serra Copo Até 65mm','Acessórios para perfuração e corte'],
 ['Cortador Tubos Wipcool 3/16 A 1-1/4 + Lâmina Reserva','Cortadores e curvadores de tubos'],
 ['Escareador Rebarbador Caneta Tirar Rebarbas Lâmina Giratória','Flangeadores e alargadores'],
 ['Kit Refrigeração com Bomba de Vácuo e Manifold','Bombas de vácuo'],
 ['Adaptador Flangeador Excentrico Uso Parafusadeira Furadeira','Flangeadores e alargadores'],
 ['Conjunto 6 Broca Alargador Expansor Cano Tubo Cobre Alumínio','Flangeadores e alargadores'],
 ['Broca Expansora para Tubos de Cobre e Alumínio','Flangeadores e alargadores'],
 ['Conector Wago 221-412 para 2 Fios — 50 Peças','Elétrica e peças'],
 ['Kit 100 Conector De Pressão Emenda 2 Vias Sem Solda','Elétrica e peças'],
 ['Conector Para Mangueira De Manifold R410A','Mangueiras e conexões'],
];
for(const [title,expected] of examples)test(title,()=>assert.equal(category(title),expected));
test('SEO uses the same specific categories as the catalogue',()=>{
 const products=examples.slice(0,5).map(([title],id)=>({id:id+1,title,image:'https://http2.mlstatic.com/photo.jpg',url:'https://meli.la/example',price:99}));
 const renderer=createSeoRenderer({generatedAt:new Date().toISOString(),products},{production:true,base:'https://sorefrigeracao.com'},source);
 const drills=renderer.categories.find(c=>c.name==='Brocas');
 assert.equal(drills.products.length,2);
 assert.ok(drills.products.every(p=>!p.title.includes('Esmerilhadeira')));
});
