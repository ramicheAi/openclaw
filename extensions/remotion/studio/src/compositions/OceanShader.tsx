import React, { useLayoutEffect, useRef } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";

// The ACTUAL SCOWW ocean — the same GLSL fragment shader that renders the live
// website hero, ported verbatim. The reel is rendered by the product's own engine
// (SIGIL × PROTEUS: the brand's substrate IS the page's WebGL behavior).
const VS = "attribute vec2 p;void main(){gl_Position=vec4(p,0.0,1.0);}";
const FS = `precision highp float;
uniform vec2 uRes;uniform float uTime;uniform vec2 uMouse;uniform float uRipple;
uniform vec2 uSun;uniform vec3 uSunCol;uniform float uSunI;uniform vec3 uSkyTop;uniform vec3 uSkyMid;uniform vec3 uSkyBot;uniform float uNight;uniform float uCloud;uniform float uRain;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),u.x),mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),u.x),u.y);}
float rainLayer(vec2 uv,float aspect,float dens,float spd,float wdt,float sd,float tm){float cx=(uv.x*aspect+uv.y*0.14)*dens;float cl=floor(cx);float fx=fract(cx)-0.5;float r=hash(vec2(cl,sd));float yy=uv.y+r*7.0-tm*spd;float seg=fract(yy*0.7);float dash=smoothstep(0.0,0.10,seg)*smoothstep(0.5,0.14,seg);float line=smoothstep(wdt,0.0,abs(fx));return dash*line*(0.45+0.55*r);}
vec3 scene(vec2 uv,float aspect){float horizon=0.5;vec2 sun=uSun;vec3 col;
 if(uv.y>horizon){
  float t=(uv.y-horizon)/(1.0-horizon);
  col=mix(uSkyBot,mix(uSkyMid,uSkyTop,smoothstep(0.0,1.0,t)),smoothstep(0.0,0.5,t));
  if(uCloud>0.01){float cl=noise(vec2(uv.x*aspect*2.2+uTime*0.02,uv.y*3.0))*0.6+noise(vec2(uv.x*aspect*5.0-uTime*0.015,uv.y*6.0))*0.4;float band=smoothstep(0.25,0.9,cl)*smoothstep(0.0,0.45,t);vec3 cc=mix(vec3(0.66,0.68,0.72),vec3(0.13,0.15,0.19),uNight);col=mix(col,cc,band*uCloud*0.85);}
  vec2 d=(uv-sun)*vec2(aspect,1.0);float dd=length(d);
  col+=uSunCol*exp(-dd*5.0)*0.9*uSunI*(1.0-uCloud*0.7);col+=uSunCol*smoothstep(0.045,0.0,dd)*uSunI*1.15*(1.0-uCloud*0.5);
 }else{
  float depth=(horizon-uv.y)/horizon;float persp=1.0/(depth*depth*7.0+0.14);
  vec2 wp=vec2((uv.x-0.5)*persp*1.4,persp+uTime*0.12);
  float h=0.0;vec2 nrm=vec2(0.0);float amp=0.6,fr=1.0;
  for(int i=0;i<5;i++){vec2 dir=normalize(vec2(sin(float(i)*1.7+0.6),0.5+cos(float(i)*2.3)));float ph=dot(dir,wp)*fr+uTime*(0.8+float(i)*0.35);h+=sin(ph)*amp;nrm+=dir*cos(ph)*amp*fr;amp*=0.55;fr*=1.95;}
  float rdm=distance(uv,uMouse);float rip=sin(rdm*42.0-uRipple*9.0)*exp(-rdm*7.0)*exp(-uRipple*1.4);
  nrm+=normalize(uv-uMouse+0.0001)*rip*2.2;
  vec3 deep=mix(vec3(0.015,0.16,0.26),vec3(0.008,0.03,0.06),uNight);vec3 shallow=mix(vec3(0.08,0.45,0.52),vec3(0.03,0.10,0.16),uNight);shallow=mix(shallow,uSkyBot*0.7,0.28);
  col=mix(deep,shallow,clamp(depth*0.65+0.18,0.0,1.0));
  float fres=pow(1.0-depth,3.0);col=mix(col,uSkyBot,fres*0.6);
  float c=noise(wp*2.6+nrm*0.6+uTime*0.18);c=pow(c,2.2);col+=vec3(0.28,0.6,0.62)*c*0.28*(1.0-depth*0.4)*(0.3+uSunI*0.7);
  vec2 toSun=normalize(sun-uv);float spec=pow(max(0.0,dot(normalize(nrm+vec2(0.0,1.0)),toSun)),6.0);
  float gln=exp(-abs(uv.x-sun.x-sin(uTime*0.22)*0.05)*7.0);col+=uSunCol*spec*gln*1.7*uSunI;
  col+=vec3(0.6,0.85,0.85)*max(0.0,1.0-rdm*4.0)*abs(rip)*0.6;
 }
 if(uRain>0.01){float rn=rainLayer(uv,aspect,90.0,1.1,0.060,1.0,uTime)*0.6+rainLayer(uv,aspect,150.0,1.7,0.045,2.0,uTime)*0.45+rainLayer(uv,aspect,210.0,2.4,0.030,3.0,uTime)*0.3;col+=vec3(0.62,0.72,0.86)*rn*uRain*0.7;col=mix(col,col*0.88,uRain*0.4);}
 return col;}
vec3 sceneCheap(vec2 uv,float aspect){float horizon=0.5;vec2 sun=uSun;vec3 col;if(uv.y>horizon){float t=(uv.y-horizon)/(1.0-horizon);col=mix(uSkyBot,mix(uSkyMid,uSkyTop,smoothstep(0.0,1.0,t)),smoothstep(0.0,0.5,t));vec2 d=(uv-sun)*vec2(aspect,1.0);float dd=length(d);col+=uSunCol*exp(-dd*5.0)*1.1*uSunI;col+=uSunCol*smoothstep(0.045,0.0,dd)*uSunI*1.9;}else{float depth=(horizon-uv.y)/horizon;vec3 deep=mix(vec3(0.015,0.16,0.26),vec3(0.008,0.03,0.06),uNight);vec3 shallow=mix(vec3(0.08,0.45,0.52),vec3(0.03,0.10,0.16),uNight);shallow=mix(shallow,uSkyBot*0.7,0.28);col=mix(deep,shallow,clamp(depth*0.65+0.18,0.0,1.0));col=mix(col,uSkyBot,pow(1.0-depth,3.0)*0.6);float gln=exp(-abs(uv.x-sun.x-sin(uTime*0.22)*0.05)*7.0);col+=uSunCol*gln*0.25*uSunI;}return col;}
vec3 aces(vec3 x){return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0);}
void main(){vec2 uv=gl_FragCoord.xy/uRes.xy;float aspect=uRes.x/uRes.y;float horizon=0.5;
 vec3 sharp=scene(uv,aspect);vec3 col=sharp;
 float coc=min(0.9,smoothstep(0.05,0.36,abs(uv.y-horizon)));
 if(coc>0.02){vec3 blur=vec3(0.0);float px=1.0/uRes.y;float ang=hash(uv*uRes.xy)*6.2831;float r=coc*9.0*px;for(int i=0;i<8;i++){float a2=ang+float(i)*0.7853;float rad=(0.4+0.6*fract(float(i)*0.37))*r;blur+=sceneCheap(uv+vec2(cos(a2),sin(a2))*rad,aspect);}blur/=8.0;col=mix(sharp,blur,coc*0.85);}
 vec3 bloom=vec3(0.0);float bpx=1.0/uRes.y;for(int i=0;i<10;i++){float a3=float(i)*0.6283;float rad=(8.0+float(i)*6.0)*bpx;vec3 s=sceneCheap(uv+vec2(cos(a3),sin(a3))*rad,aspect);bloom+=max(s-0.78,0.0);}bloom/=10.0;col+=bloom*1.05;
 col=mix(col,uSkyBot*1.0,smoothstep(0.045,0.0,abs(uv.y-horizon))*0.18);
 col=aces(col*1.04);
 // CHROMA grade (Soret/Sonnenfeld via Scope-Composed Frame): deepen blacks clean, protect highlights, controlled +sat — the inverse of the prior milky/clipped/desaturated pass.
 col=max((col-0.024)/0.976,0.0);                        // true black point — kill the milky lift
 col=col-max(col-0.93,0.0)*0.55;                         // highlight shoulder — sun path rolls off, never flat-white
 float lum=dot(col,vec3(0.299,0.587,0.114));col=mix(vec3(lum),col,1.12); // controlled saturation (inverse of the ~21% desat)
 col*=1.0-0.42*pow(distance(uv,vec2(0.5,0.54)),2.0);     // vignette — clean, deepened corners
 float grain=hash(uv*uRes.xy+fract(uTime)*97.13)-0.5;col+=grain*0.028;
 gl_FragColor=vec4(col,1.0);}`;

// Dusk uniforms — civil twilight to match the footage (purple horizon, warm low sun).
const DUSK = {
  skyTop: [0.183, 0.187, 0.407] as const,
  skyMid: [0.617, 0.391, 0.383] as const,
  skyBot: [0.907, 0.527, 0.367] as const,
  sun: [0.36, 0.2] as const,
  sunCol: [1.0, 0.62, 0.36] as const,
  sunI: 0.3,
  night: 0.42,
};

type GLState = { gl: WebGLRenderingContext; program: WebGLProgram; u: Record<string, WebGLUniformLocation | null> };

export const OceanShader: React.FC<{ timeOffset?: number }> = ({ timeOffset = 40 }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<GLState | null>(null);
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const t = timeOffset + frame / fps;
  // half-res internal buffer (the ocean is soft; upscales cleanly) for render speed.
  const RW = Math.round(width / 2);
  const RH = Math.round(height / 2);

  useLayoutEffect(() => {
    const c = ref.current;
    if (!c) return;
    if (!glRef.current) {
      const gl = c.getContext("webgl", { preserveDrawingBuffer: true });
      if (!gl) return;
      const mk = (type: number, src: string) => {
        const s = gl.createShader(type)!;
        gl.shaderSource(s, src);
        gl.compileShader(s);
        return s;
      };
      const program = gl.createProgram()!;
      gl.attachShader(program, mk(gl.VERTEX_SHADER, VS));
      gl.attachShader(program, mk(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(program);
      gl.useProgram(program);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(program, "p");
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      const u: Record<string, WebGLUniformLocation | null> = {};
      ["uRes", "uTime", "uMouse", "uRipple", "uSun", "uSunCol", "uSunI", "uSkyTop", "uSkyMid", "uSkyBot", "uNight", "uCloud", "uRain"].forEach(
        (k) => (u[k] = gl.getUniformLocation(program, k)),
      );
      glRef.current = { gl, program, u };
    }
    const { gl, program, u } = glRef.current;
    gl.useProgram(program);
    gl.viewport(0, 0, RW, RH);
    gl.uniform2f(u.uRes, RW, RH);
    gl.uniform1f(u.uTime, t);
    gl.uniform2f(u.uMouse, 0.5, 0.5);
    gl.uniform1f(u.uRipple, 99);
    gl.uniform2f(u.uSun, DUSK.sun[0], DUSK.sun[1]);
    gl.uniform3f(u.uSunCol, DUSK.sunCol[0], DUSK.sunCol[1], DUSK.sunCol[2]);
    gl.uniform1f(u.uSunI, DUSK.sunI);
    gl.uniform3f(u.uSkyTop, DUSK.skyTop[0], DUSK.skyTop[1], DUSK.skyTop[2]);
    gl.uniform3f(u.uSkyMid, DUSK.skyMid[0], DUSK.skyMid[1], DUSK.skyMid[2]);
    gl.uniform3f(u.uSkyBot, DUSK.skyBot[0], DUSK.skyBot[1], DUSK.skyBot[2]);
    gl.uniform1f(u.uNight, DUSK.night);
    gl.uniform1f(u.uCloud, 0);
    gl.uniform1f(u.uRain, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }, [frame, RW, RH, t]);

  return (
    <AbsoluteFill>
      <canvas ref={ref} width={RW} height={RH} style={{ width: "100%", height: "100%", display: "block" }} />
    </AbsoluteFill>
  );
};
