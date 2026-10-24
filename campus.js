/* SJSU main campus. Metres from 7th St × Paseo de San Carlos. +x east, +y north.
   Footprints follow the current map.sjsu.edu 3D campus (4th–10th, San Fernando–San Salvador). */
(function(){
  const R=(x,y,w,h)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
  const b=(id,code,name,x,y,w,d,h,extra)=>({id,code,name,p:R(x,y,w,d),h,...(extra||{})});
  const poly=(id,code,name,p,h,extra)=>({id,code,name,p,h,...(extra||{})});

  window.CAMPUS={
    origin:{lat:37.3352,lon:-121.8811},
    bounds:{x0:-560,x1:520,y0:-340,y1:540},
    streets:[
      {p:[[-446,504],[432,504]],w:18,name:'E San Fernando St'},
      {p:[[-446,-286],[432,-286]],w:18,name:'E San Salvador St'},
      {p:[[-446,504],[-446,-286]],w:16,name:'S 4th St'},
      {p:[[-2,504],[-2,-286]],w:14,name:'S 7th St'},
      {p:[[141,-1],[141,-286]],w:12,name:'S 8th St'},
      {p:[[286,504],[286,-80]],w:12,name:'S 9th St'},
      {p:[[432,504],[432,-286]],w:16,name:'S 10th St'},
      {p:[[-446,-1],[432,-1]],w:22,name:'Paseo de San Carlos'}
    ],
    greens:[
      R(-310,250,210,145),
      R(-310,145,175,100),
      R(-200,300,90,90),
      R(70,140,80,45),
      R(170,-110,90,28),
      R(300,0,40,22),
      R(-80,10,50,28)
    ],
    pools:[
      R(248,-48,52,24),
      R(305,-44,34,20)
    ],
    buildings:[
      /* west of 7th, north */
      poly('king','KING','Dr. Martin Luther King, Jr. Library',[
        [-430,255],[-305,255],[-305,388],[-228,388],[-228,492],[-430,492]
      ],36),
      b('sci','SCI','Science Building',-430,142,128,108,24),
      b('hgh','HGH','Hugh Gillis Hall',-210,398,85,94,22),
      b('irc','IRC','InstRuctional Resource Center',-118,408,52,80,20),
      b('dmh','DMH','Dudley Moorhead Hall',-60,400,48,92,24),
      b('adm','ADM','Administration',-6,418,68,76,20),
      b('cc','CC','Central Classroom',-148,318,92,72,16),
      b('cl','CL','Clark Hall',-42,310,78,82,18),
      b('th','TH','Tower Hall',-248,158,68,92,34),
      b('md','MD','Morris Dailey Auditorium',-168,208,58,48,16),
      b('dbh','DBH','Dwight Bentel Hall',-158,62,88,78,18),
      b('fob','FOB','Faculty Office Building',-62,38,62,52,14),

      /* west of 7th, south */
      b('wsq','WSQ','Washington Square Hall',-412,12,118,112,22),
      b('naissc','NAIS','Native American Indigenous Student Success Center',-282,18,68,48,10),
      b('yuh','YUH','Yoshihiro Uchida Hall',-428,-178,102,88,22),
      b('spxc','SPXC','Spartan Complex West',-205,-78,92,78,16),
      b('spx','SPXE','Spartan Complex East',-102,-72,88,68,16),
      b('isb','ISB','Interdisciplinary Sciences Building',-300,-248,112,140,46),
      b('dh','DH','Duncan Hall',-178,-252,88,92,28),
      b('mh','MH','MacQuarrie Hall',-98,-182,88,88,36),
      b('wpg','WPG','West Parking Garage',-428,-280,118,58,18,{park:true}),

      /* east of 7th, north */
      b('su','SU','Diaz Compean Student Union',22,198,148,112,24),
      b('eng','ENG','Charles W. Davidson College of Engineering',58,328,178,168,32),
      b('is','IS','Industrial Studies',248,372,88,122,20),
      b('ash','ASH','Associated Students House',292,302,52,52,12),
      b('bt','BT','Business Tower',348,272,72,112,52),
      b('bbc','BBC','Boccardo Business Center',302,200,118,64,24),
      b('art','ART','Art Building',228,122,88,58,18),
      b('hb','HB','Health Building',228,68,80,48,16),
      b('cp','CP','Career Center',318,184,40,14,12),
      b('mus','MUS','Music Building',158,78,66,68,18),

      /* east of 7th, south */
      b('swc','SWC','Student Wellness Center',42,18,88,52,16),
      b('pcuec','EC','Provident Credit Union Event Center',158,4,100,62,20),
      b('sh','SH','Sweeney Hall',48,-82,100,80,22),
      b('srac','SRAC','Spartan Recreation and Aquatic Center',175,-100,118,88,22),
      b('wsh','WSH','Washburn Hall',198,-198,88,58,18),
      b('dc','CM','Dining Commons',298,-198,70,46,14),
      b('spg','SPG','South Parking Garage',18,-280,188,76,22,{park:true}),
      b('upd','UPD','University Police Department',218,-280,70,40,12),

      /* housing between 9th and 10th */
      b('cvb','CVB','Campus Village B',352,98,70,82,40),
      b('cv2','CV2','Campus Village 2',275,6,70,86,56),
      b('cvc','CVC','Campus Village C',354,6,68,84,32),
      b('jwh','JWH','Joe West Hall',302,-68,76,62,30),
      b('cva','CVA','Campus Village A',288,-145,88,64,28),
      b('cg','CG','Campus Village G',354,-145,64,46,18),
      b('cde','CDE','Campus Village D/E',354,-228,68,42,16),

      /* off the west edge */
      b('htc','HTC','Hammer Theatre Center',-548,70,78,88,20)
    ],
    gold:[],
    labels:[
      {t:'E San Fernando St',p:[40,522]},
      {t:'E San Salvador St',p:[40,-308]},
      {t:'S 4th St',p:[-468,80]},
      {t:'S 10th St',p:[452,40]},
      {t:'S 7th St',p:[18,120]},
      {t:'Paseo de San Carlos',p:[-180,-18]}
    ],
    gates:[
      {n:'North',p:[-2,504]},
      {n:'South',p:[-2,-286]},
      {n:'West',p:[-446,-1]},
      {n:'East',p:[432,-1]}
    ]
  };
})();
