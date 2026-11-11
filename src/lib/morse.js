export const MAX_LEN=120;
export const MORSE={A:'.-',B:'-...',C:'-.-.',D:'-..',E:'.',F:'..-.',G:'--.',H:'....',I:'..',J:'.---',K:'-.-',L:'.-..',M:'--',N:'-.',O:'---',P:'.--.',Q:'--.-',R:'.-.',S:'...',T:'-',U:'..-',V:'...-',W:'.--',X:'-..-',Y:'-.--',Z:'--..',0:'-----',1:'.----',2:'..---',3:'...--',4:'....-',5:'.....',6:'-....',7:'--...',8:'---..',9:'----.'};
/** Live input: any whitespace (incl. newlines) becomes a space. Newline is transport framing, never message content. */
export const normalizeInput=t=>String(t??'').replace(/\s/g,' ').slice(0,MAX_LEN);
/** Message model: single-spaced, trimmed plain text. */
export const normalizeMessage=t=>normalizeInput(t).replace(/ +/g,' ').trim();
export function encode(text){
  const message=normalizeMessage(text),unsupported=new Set();
  const words=message.toUpperCase().split(' ').filter(Boolean).map(w=>[...w].flatMap(ch=>{if(MORSE[ch])return[{ch,code:MORSE[ch]}];unsupported.add(ch);return[]})).filter(w=>w.length);
  return{message,words,unsupported:[...unsupported]};
}
export const toMorseString=t=>encode(t).words.map(w=>w.map(c=>c.code).join(' ')).join(' / ');
