import Phaser from "phaser";
import { GameAudio } from "./audio/GameAudio";
import { JuiceManager } from "./juice/JuiceManager";

function img(scene: Phaser.Scene, key: string, path: string): void {
  if (!scene.textures.exists(key)) scene.load.image(key, path);
}

/** Carga compartida (Inicio + partida). No recarga si ya está en cache. */
export function queueGameAssets(scene: Phaser.Scene): void {
  img(scene, "bg", "assets/bg.png");
  img(scene, "ark", "assets/new_ark.png");
  img(scene, "home_bg", "assets/background1.png");
  img(scene, "home_ark", "assets/ark_inicio.png");
  img(scene, "home_logo", "assets/logo.png");
  img(scene, "btn_tienda", "assets/btn_tienda.png");
  img(scene, "btn_leaderboard", "assets/btn_leaderboard.png");
  img(scene, "btn_settings", "assets/btn_settings.png");
  img(scene, "btn_questions", "assets/btn_questions.png");
  for (let i = 1; i <= 10; i++) {
    img(scene, `animal-${i}`, `assets/animal-${i}.png`);
    img(scene, `animal-${i}-sil`, `assets/animal-${i}-sil.png`);
  }
  img(scene, "icon_de_dos", "assets/icon_de_dos_2.png");
  img(scene, "icon_cuervo", "assets/icon_cuervo_2.png");
  img(scene, "icon_rayo", "assets/icon_rayo_2.png");
  img(scene, "icon_agua", "assets/icon_agua_2.png");
  img(scene, "icon_olivo", "assets/hoja_olivo.png");
  img(scene, "hoja_olivo", "assets/hoja_olivo.png");
  img(scene, "olivo_container", "assets/olivo_container.png");
  img(scene, "score_container", "assets/score_container.png");
  img(scene, "triumph", "assets/triumph.png");
  img(scene, "icon_no_ads", "assets/icon_no_ads.png");
  img(scene, "icon_no_ads_2", "assets/icon_no_ads_2.png");
  img(scene, "fondo_modal", "assets/fondo_modal.png");
  img(scene, "cadena_evolutiva", "assets/cadena_evolutiva.png");
  img(scene, "wheel", "assets/wheel.png");
  img(scene, "boton1", "assets/boton1.png");
  img(scene, "boton2", "assets/boton2.png");
  img(scene, "hud_button", "assets/button.png");
  img(scene, "modal_frame", "assets/modal_frame.png");
  img(scene, "modal_header", "assets/modal_header.png");
  img(scene, "btn_close", "assets/btn_close.png");
  img(scene, "btn_close_pressed", "assets/btn_close_pressed.png");
  img(scene, "toggle_on", "assets/toggle_on.png");
  img(scene, "toggle_off", "assets/toggle_off.png");
  img(scene, "btn_buy", "assets/btn_buy.png");
  img(scene, "btn_buy_pressed", "assets/btn_buy_pressed.png");
  img(scene, "shop_ribbon_green", "assets/shop_ribbon_green.png");
  img(scene, "shop_ribbon_blue", "assets/shop_ribbon_blue.png");
  img(scene, "olivo1", "assets/olivo1.png");
  img(scene, "olivo2", "assets/olivo2.png");
  img(scene, "olivo3", "assets/olivo3.png");
  img(scene, "section_leaf", "assets/section_leaf.png");
  img(scene, "gameover_frame", "assets/gameover-frame.png");
  img(scene, "continue_frame", "assets/continue_frame1.png");
  img(scene, "continue_badge", "assets/continue_badge.png");
  img(scene, "timer_ring", "assets/timer_ring.png");
  img(scene, "btn_green_large", "assets/btn_green_large.png");
  img(scene, "btn_green_large_pressed", "assets/btn_green_large_pressed.png");
  img(scene, "icon_video", "assets/icon_video.png");
  img(scene, "btn_green", "assets/btn-green.png");
  img(scene, "btn_blue", "assets/btn-blue.png");
  img(scene, "btn_beige", "assets/btn-beige.png");
  img(scene, "icon_elephant", "assets/icon-elephant.png");
  img(scene, "icon_leaf_branch", "assets/icon-leaf-branch.png");
  img(scene, "icon_coin", "assets/icon-coin.png");
  img(scene, "ribbon_record", "assets/ribbon-record.png");
  if (!scene.cache.bitmapFont.exists("baloo2")) {
    scene.load.bitmapFont(
      "baloo2",
      "assets/fonts/baloo2.png",
      "assets/fonts/baloo2.xml"
    );
  }
  scene.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR);
  scene.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
    if (file?.key === "bgm_ark") {
      // Silenciar: no tumbar el boot por un mp3 ausente/corrupto.
    }
  });
  GameAudio.queueMusicLoad(scene);
  GameAudio.queueReadySfxLoads(scene);
  GameAudio.queueSfxLoads(scene);
  JuiceManager.generateRuntimeTextures(scene);
}
