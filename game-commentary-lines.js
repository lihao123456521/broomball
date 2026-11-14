/* Complete English announcements, recorded as one clip per event to keep names fluent. */
(() => {
 'use strict';
 const houseNames=Object.freeze({
  gryffindor:'Gryffindor',
  slytherin:'Slytherin',
  ravenclaw:'Ravenclaw',
  hufflepuff:'Hufflepuff'
 });
 const nameById=Object.freeze({
  harry:'Harry Potter',
  hermione:'Hermione Granger',
  ron:'Ron Weasley',
  draco:'Draco Malfoy',
  pansy:'Pansy Parkinson',
  blaise:'Blaise Zabini',
  luna:'Luna Lovegood',
  cho:'Cho Chang',
  padma:'Padma Patil',
  cedric:'Cedric Diggory',
  hannah:'Hannah Abbott',
  ernie:'Ernie Macmillan'
 });
 const clips={};
 const add=(id,text)=>{clips[id]=Object.freeze({text,src:'./assets/commentary/'+id+'.m4a'});};
 for(const [home,homeName] of Object.entries(houseNames)){
  for(const [away,awayName] of Object.entries(houseNames)){
   if(home!==away)add('kickoff-'+home+'-'+away,homeName+' against '+awayName+'. Brooms up!');
  }
  add('possession-'+home,homeName+' take possession!');
  add('shot-'+home,homeName+' line up the hoops. Shot away!');
  add('goal-'+home,'Goal for '+homeName+'! Ten points on the board!');
  add('result-'+home,homeName+' win it! What a finish!');
  add('snitch-catch-'+home,homeName+' catch the Snitch! One hundred and fifty points!');
 }
 add('training','Training begins. Take flight, then collect the Quaffle.');
 add('training-end',"Training complete. You're ready for the match!");
 add('pass','A quick pass to a teammate!');
 add('return-pass','The return pass is on its way!');
 add('time-60','One minute to play!');
 add('time-30','Thirty seconds left. Every play counts!');
 add('time-10','Ten seconds left! One last chance!');
 add('snitch','The Golden Snitch is out! Keep your eyes on it!');
 add('result-draw','All square. The match ends in a draw!');
 for(const [id,name] of Object.entries(nameById)){
  add('player-possession-'+id,name+' has the Quaffle!');
  add('player-shot-'+id,name+' shoots for the hoops!');
 }
 window.BroomCommentaryClips=Object.freeze(clips);
 window.BroomCommentaryLines=Object.freeze({houseNames,nameById});
})();
