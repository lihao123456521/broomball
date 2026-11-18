/* Match identity and appearance data only; no abilities or cooldowns. */
window.BroomRoster=(()=>{const rosters={
 "gryffindor": [
  {
   "id": "harry",
   "name": "哈利 · 波特",
   "en": "HARRY POTTER",
   "hair": 2171179
  },
  {
   "id": "hermione",
   "name": "赫敏 · 格兰杰",
   "en": "HERMIONE GRANGER",
   "hair": 5321767,
   "longHair": true
  },
  {
   "id": "ron",
   "name": "罗恩 · 韦斯莱",
   "en": "RON WEASLEY",
   "hair": 11755058
  }
 ],
 "slytherin": [
  {
   "id": "draco",
   "name": "德拉科 · 马尔福",
   "en": "DRACO MALFOY",
   "hair": 14209185
  },
  {
   "id": "pansy",
   "name": "潘西 · 帕金森",
   "en": "PANSY PARKINSON",
   "hair": 1448992,
   "bob": true
  },
  {
   "id": "blaise",
   "name": "布雷斯 · 扎比尼",
   "en": "BLAISE ZABINI",
   "hair": 1643539,
   "skin": 9198400
  }
 ],
 "ravenclaw": [
  {
   "id": "luna",
   "name": "卢娜 · 洛夫古德",
   "en": "LUNA LOVEGOOD",
   "hair": 14271883,
   "longHair": true
  },
  {
   "id": "cho",
   "name": "秋 · 张",
   "en": "CHO CHANG",
   "hair": 1514016,
   "longHair": true
  },
  {
   "id": "padma",
   "name": "帕德玛 · 佩蒂尔",
   "en": "PADMA PATIL",
   "hair": 2300696,
   "skin": 12158305,
   "longHair": true
  }
 ],
 "hufflepuff": [
  {
   "id": "cedric",
   "name": "塞德里克 · 迪戈里",
   "en": "CEDRIC DIGGORY",
   "hair": 6044454
  },
  {
   "id": "hannah",
   "name": "汉娜 · 艾博",
   "en": "HANNAH ABBOTT",
   "hair": 13871701,
   "longHair": true
  },
  {
   "id": "ernie",
   "name": "厄尼 · 麦克米兰",
   "en": "ERNIE MACMILLAN",
   "hair": 7953461
  }
 ]
};
 const keepers={
  gryffindor:{id:'gryffindor-keeper',name:'格兰芬多守门员',hair:0x503024,skin:0xbb845e},
  slytherin:{id:'slytherin-keeper',name:'斯莱特林守门员',hair:0x302527,skin:0xe0b094},
  ravenclaw:{id:'ravenclaw-keeper',name:'拉文克劳守门员',hair:0x402f29,skin:0xa16c4e},
  hufflepuff:{id:'hufflepuff-keeper',name:'赫奇帕奇守门员',hair:0x82532f,skin:0xdeac87}
 };
 // The selection screen contains the three outfield captains in each house.
 const all=Object.values(rosters).flat();
 const byIdentity=new Map([...all,...Object.values(keepers)].map(profile=>[profile.id,profile]));
 return Object.freeze({rosters,keepers,all,byId:id=>byIdentity.get(id)});
})();
window.SchoolMagic=window.BroomRoster;
