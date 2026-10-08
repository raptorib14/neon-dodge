# Neon Dodge

Juego web de Nico. Jugalo en **https://raptorib14.github.io/neon-dodge/**

Anda en compu (Chrome, Edge, Safari) y en iPad o celular (Safari, Chrome). No hay que instalar nada.

**Novedades v4:** 3 armas (Pistola, Ametralladora y RPG), 5 vidas, 3 mapas (Arena Neón, Pilares y Portales),
ataques nuevos de los jefes (siempre avisan antes) y menos enemigos en pantalla.

## Jugar con amigos (cooperativo, 2 a 4)

1. Uno toca **CREAR PARTIDA**. Le aparece un **código** de 5 letras, por ejemplo `K7QXM`.
2. Les pasa el código o toca **Copiar link** y se lo manda por WhatsApp.
3. Los demás abren el link, o entran a la página, tocan **UNIRSE CON CÓDIGO** y escriben el código.
4. Cuando están todos en la sala, el host toca **EMPEZAR**.

Juegan todos juntos contra los enemigos y los jefes, con el puntaje compartido. Cada uno tiene su color
y su nombre arriba de la nave, y 5 vidas. Si te quedás sin vidas, quedás fuera y volvés con 1 vida a los
12 segundos (o cuando cae un jefe). Pierden si quedan todos fuera y ganan si vencen al TITAN. El mapa lo elige
el que crea la partida. Con más jugadores hay más enemigos y los jefes tienen más vida.
Solo el host puede pausar.

**¿No conecta?**
- Si dice **"Versión distinta: bajá la última del link"**, alguien tiene la página vieja: recarguen la página
  todos (en el iPad, cerrá la pestaña y abrí el link de nuevo).
- Conviene que cree la partida alguien **en compu**, no en el iPad.
- No cambies de app ni bloquees el iPad mientras jugás. Si pasa, el juego intenta reconectarte solo cuando volvés.
- En la WiFi del cole puede que no ande, porque algunas redes bloquean este tipo de conexión. Prueben con
  **los datos del celular** o en la WiFi de una casa.
- Si tarda mucho en darte el código, esperá un ratito y probá de nuevo.

## Controles

- **iPad / celu:** dedo izquierdo = joystick · dedo derecho = disparar (si arrastrás, apuntás; si no,
  apunta solo al enemigo más cercano) · botón **ARMA** (arriba del de disparo) = cambiar de arma.
- **Compu:** WASD o flechas = mover · clic = disparar a la mira · **1, 2, 3**, la **rueda del mouse** o **Q** =
  cambiar de arma · P = pausa · R = reiniciar · ESC = menú.

## Armas

- **Pistola:** la de siempre, precisa.
- **Ametralladora:** muchísimas balas por segundo, pero cada una pega menos.
- **RPG:** un cohete lento que explota y les hace daño a todos los enemigos cerca. Después de cada tiro tarda
  un poquito en recargar: mirá la barrita.

## Mapas

Se elige en el menú y el juego se acuerda del último que elegiste.

- **Arena Neón:** el mapa de siempre, abierto.
- **Pilares:** pilares que no se pueden atravesar y que frenan las balas (las tuyas y las de los enemigos).
- **Portales:** 2 pares de portales. Si entrás por uno, salís por el otro.

## Cómo funciona (técnico)

Son archivos estáticos (`index.html`, `game.js`, `style.css`, `icon.png`). El multijugador usa WebRTC
peer-to-peer con [PeerJS](https://peerjs.com) 1.5.5, incluido en el repo (`peerjs.min.js`, licencia MIT en
`LICENSE-peerjs.txt`). Los navegadores se encuentran con el servidor público y gratuito de PeerJS
(`0.peerjs.com`), y después los datos van directo entre ellos (STUN de Google/Cloudflare, sin TURN).
El navegador del host simula todo. Los demás le mandan sus controles y reciben el estado unas 20 veces por segundo.
