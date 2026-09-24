// Names for the content ladder's recurring characters.
export const RIVAL_NAMES = [
  'Synergo', 'Plumly', 'Brightloop', 'Taskwell', 'Notora', 'Quillsy', 'Fernbase', 'Orbitly', 'Kettle.io', 'Hivemind Labs',
  'Paperplane', 'Stacksmith',
];

export const PET_NAMES = {
  dog: ['Biscuit', 'Pixel', 'Waffles', 'Kernel', 'Mochi', 'Sprocket', 'Bagel', 'Nugget', 'Juniper', 'Rusty'],
  cat: ['Null', 'Mittens', 'Sudo', 'Tofu', 'Professor', 'Ghost', 'Miso', 'Captain'],
};

// Video-call moments, spoken by people on a call (lockdown weeks, and some hybrid or remote weeks).
// Each is a list of turns [role, variants]; any variant of a reply works after any variant before it.
export const CALL_SCRIPTS = [
  [['a', ['...and that is why the numbers look like that.', 'So, to sum up the last five minutes...', '...which is why I think we ship on Friday.']],
    ['b', ['You are on mute.', '{a}, you are on mute.', 'We cannot hear you. You have been muted the whole time.']],
    ['a', ['Oh. How much did you miss?', 'Great. I will start again from the top.', 'Cool. I will just write a doc.']]],
  [['a', ['Can everyone see my screen?', 'Is my screen sharing? Say yes.', 'Can you see the slide?']],
    ['b', ['We can see your inbox.', 'We see your desktop. Nice wallpaper.', 'We see a very long row of tabs.']],
    ['a', ['That is not the slide.', 'Please stop reading my inbox.', 'Okay, nobody read the tab titles.']]],
  [['a', ['Sorry, that was the blender.', 'That noise was my neighbour\'s drill. Every day at ten.', 'That was the dog. He has notes.']],
    ['b', ['It sounded like a jet engine.', 'Honestly, it added something.', 'The dog made a good point.']]],
  [['a', ['Hello? Did I freeze?', 'You all froze. Or I froze.', 'My internet says it is fine. My internet is lying.']],
    ['b', ['You froze mid-sneeze. That is your portrait now.', 'You were a still image for a minute. Very flattering.', 'We lost you at "quick update".']]],
  [['a', ['No, you go.', 'Sorry, go ahead.', 'You first.']],
    ['b', ['No, no, you go.', 'Sorry, you go ahead.', 'Please, after you.']],
    ['a', ['Okay. What was I saying?', 'Let us all just type it in the chat.', 'I forgot what I was going to say.']]],
  [['a', ['Why is your camera pointing at the ceiling?', '{b}, we can see your ceiling fan.', 'Is that your forehead?']],
    ['b', ['The laptop is on a stack of books. This is the angle.', 'I am attending as a light fixture today.', 'This is my good side.']]],
  [['a', ['Quick one, this will take two minutes.', 'Can we keep this short? I have a hard stop.', 'Let us do a quick round of updates.']],
    ['b', ['That was forty minutes ago.', 'It has been two minutes for half an hour.', 'Your hard stop was twenty minutes ago.']]],
];
