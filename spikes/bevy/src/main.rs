//! POC descartável Bevy x Three.js (pedido do Fernando, 11/11): a mesma cena da medição de desempenho
//! (docs/medicoes/desempenho-2026-11-11.md): mapa 20x20 gerado, 9 unidades paradas, câmera ortográfica,
//! sombra, pixel art por render em baixa resolução, 1 botão e 1 texto. Sem regras de batalha.
//! Pixel art: `--px 2` no nativo, `?px=2` na web (0 ou ausente = desligado).
use bevy::{
    asset::RenderAssetUsages,
    camera::{RenderTarget, ScalingMode},
    diagnostic::{DiagnosticsStore, FrameTimeDiagnosticsPlugin},
    image::ImageSampler,
    light::CascadeShadowConfigBuilder,
    light::DirectionalLightShadowMap,
    prelude::*,
    render::render_resource::{Extent3d, TextureFormat},
    ui_widgets::{observe, Activate, Button},
    window::{PresentMode, PrimaryWindow, WindowResolution},
    world_serialization::WorldInstanceReady,
};

const N: i32 = 20;
const STEP: f32 = 0.5; // altura de um nível, igual ao scene.ts
const FIT: f32 = 25.465; // ((20 + 20) / sqrt(2) + 1) / 1.15, o fitView do scene.ts

// (arquivo, tamanho x/z, tamanho y, topo y) medidos com gltf-transform em 11/11
const DIRT: (&str, f32, f32, f32) = ("poc/quadrado/dirt.gltf", 2.088, 2.088, 1.044);
const GRASS: (&str, f32, f32, f32) = ("poc/quadrado/dirt_with_grass.gltf", 2.166, 2.044, 1.0);
const STONE: (&str, f32, f32, f32) = ("poc/quadrado/stone.gltf", 2.02, 2.02, 1.01);
const TREE: &str = "poc/hex/tree_single_A.gltf"; // y de -0,103 a 1,094

// (modelo, altura do modelo, altura no jogo, x, y): as mesmas casas do 20x20 da medição
const UNITS: [(&str, f32, f32, i32, i32); 8] = [
    ("knight.glb", 2.467, 0.85, 4, 17),
    ("rogue.glb", 2.447, 0.85, 2, 18),
    ("mage.glb", 2.716, 0.85, 3, 19),
    ("rogue_hooded.glb", 2.251, 0.85, 5, 18),
    ("skeleton_warrior.glb", 2.59, 0.85, 11, 2),
    ("skeleton_rogue.glb", 2.308, 0.85, 13, 3),
    ("skeleton_mage.glb", 2.63, 0.85, 12, 2),
    ("barbarian.glb", 2.398, 1.05, 10, 3),
];
const IDLE: usize = 10; // índice do clipe Idle em todos os .glb (conferido com gltf-transform)

#[derive(Resource)]
struct Px(u32);
#[derive(Resource)]
struct Canvas(Handle<Image>);
#[derive(Resource, Default)]
struct Ready(usize);
#[derive(Component)]
struct GameCam;
#[derive(Component)]
struct FpsText;
#[derive(Component)]
struct Idle(Handle<AnimationGraph>, AnimationNodeIndex);

#[cfg(target_arch = "wasm32")]
fn options() -> (u32, Option<f32>) {
    let w = web_sys::window().unwrap();
    let q = w.location().search().unwrap_or_default();
    let px = q.split("px=").nth(1).and_then(|s| s.split('&').next()?.parse().ok()).unwrap_or(0);
    // nitidez até 2x, como o jogo faz sem pixel art
    (px, Some((w.device_pixel_ratio() as f32).min(2.0)))
}
#[cfg(not(target_arch = "wasm32"))]
fn options() -> (u32, Option<f32>) {
    let a: Vec<String> = std::env::args().collect();
    (a.iter().position(|s| s == "--px").and_then(|i| a.get(i + 1)?.parse().ok()).unwrap_or(0), None)
}

fn main() {
    let (px, scale) = options();
    let mut resolution = WindowResolution::new(1920, 1080);
    if let Some(s) = scale {
        resolution = resolution.with_scale_factor_override(s);
    }
    let mut app = App::new();
    app
        .add_plugins(
            DefaultPlugins
                .set(WindowPlugin {
                    primary_window: Some(Window {
                        title: "Dungeon Tactics — POC Bevy".into(),
                        resolution,
                        present_mode: PresentMode::AutoNoVsync, // mede vazão, como o Chrome sem vsync da medição
                        canvas: Some("#bevy".into()),
                        fit_canvas_to_parent: true,
                        ..default()
                    }),
                    ..default()
                })
                .set(AssetPlugin {
                    // os modelos do jogo, sem copiar: pasta no nativo, URL na web
                    file_path: if cfg!(target_arch = "wasm32") { "models" } else { "../../public/models" }.into(),
                    meta_check: bevy::asset::AssetMetaCheck::Never, // sem pedir um .meta por arquivo (404 na web)
                    ..default()
                }),
        )
        .add_plugins(FrameTimeDiagnosticsPlugin::default())
        .insert_resource(Px(px))
        .insert_resource(Ready::default())
        .insert_resource(ClearColor(Color::srgb_u8(0x1b, 0x16, 0x26)))
        .insert_resource(DirectionalLightShadowMap { size: 1024 })
        .insert_resource(GlobalAmbientLight { color: Color::WHITE, brightness: 600.0, ..default() })
        .add_systems(Startup, setup)
        .add_systems(Update, (fit, fps));
    // no nativo o FPS sai no terminal (na web quem mede é o web/bench.mjs); tem de vir depois dos DefaultPlugins
    #[cfg(not(target_arch = "wasm32"))]
    app.add_plugins(bevy::diagnostic::LogDiagnosticsPlugin::default());
    app.run();
}

fn height(x: i32, y: i32) -> i32 {
    ((1.5 + 1.5 * (x as f64 / 3.1).sin() * (y as f64 / 2.7).cos()).round() as i32).clamp(0, 3)
}
fn terrain(x: i32, y: i32) -> char {
    match (x * 7 + y * 13) % 23 {
        0 => '#',
        1 | 2 => 'T',
        _ => '.',
    }
}
// nível mais alto ocupado pela coluna (-1 fora do mapa)
fn column_top(x: i32, y: i32) -> i32 {
    if x < 0 || y < 0 || x >= N || y >= N {
        return -1;
    }
    height(x, y) + if terrain(x, y) == '#' { 2 } else { 0 }
}
fn world(x: i32, y: i32) -> Vec3 {
    Vec3::new(x as f32 - N as f32 / 2.0 + 0.5, (height(x, y) + 1) as f32 * STEP, y as f32 - N as f32 / 2.0 + 0.5)
}

fn setup(
    mut commands: Commands,
    assets: Res<AssetServer>,
    px: Res<Px>,
    mut images: ResMut<Assets<Image>>,
    mut graphs: ResMut<Assets<AnimationGraph>>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
) {
    let scene = |f: &str| assets.load(GltfAssetLabel::Scene(0).from_asset(f.to_string()));
    // peça normalizada para 1 casa de largura e STEP de altura, com o topo no y pedido
    let block = |(f, xz, sy, top): (&str, f32, f32, f32), at: Vec3| {
        let s = Vec3::new(1.0 / xz, STEP / sy, 1.0 / xz);
        (WorldAssetRoot(scene(f)), Transform::from_translation(at - Vec3::Y * top * s.y).with_scale(s))
    };
    for y in 0..N {
        for x in 0..N {
            let (h, wall) = (height(x, y), terrain(x, y) == '#');
            let w = world(x, y);
            for k in 0..=h + if wall { 2 } else { 0 } {
                let at = Vec3::new(w.x, (k + 1) as f32 * STEP, w.z);
                if wall {
                    commands.spawn(block(STONE, at));
                } else if k == h {
                    commands.spawn(block(GRASS, at));
                } else if ![(1, 0), (-1, 0), (0, 1), (0, -1)].iter().all(|(dx, dy)| column_top(x + dx, y + dy) >= k) {
                    // bloco cercado pelos quatro lados fica fora, como no scene.ts
                    commands.spawn(block(DIRT, at));
                }
            }
            if terrain(x, y) == 'T' {
                let s = 1.1 / 1.197;
                commands.spawn((WorldAssetRoot(scene(TREE)), Transform::from_translation(w + Vec3::Y * 0.103 * s).with_scale(Vec3::splat(s))));
            }
        }
    }
    for (file, model_h, game_h, x, y) in UNITS {
        let (graph, node) = AnimationGraph::from_clip(assets.load(GltfAssetLabel::Animation(IDLE).from_asset(file)));
        commands
            .spawn((
                WorldAssetRoot(scene(file)),
                Transform::from_translation(world(x, y)).with_scale(Vec3::splat(game_h / model_h)),
                Idle(graphs.add(graph), node),
            ))
            .observe(play_idle);
    }
    // o Farol não tem modelo: um cristal que brilha
    commands.spawn((
        Mesh3d(meshes.add(Sphere::new(0.32).mesh().ico(1).unwrap())),
        MeshMaterial3d(materials.add(StandardMaterial { base_color: Color::srgb_u8(0x7f, 0xf3, 0xff), emissive: LinearRgba::rgb(0.2, 1.4, 1.8), ..default() })),
        Transform::from_translation(world(3, 18) + Vec3::Y * 0.55),
    ));
    commands.spawn((
        DirectionalLight { shadow_maps_enabled: true, illuminance: 9000.0, ..default() },
        Transform::from_xyz(-6.0, 12.0, 4.0).looking_at(Vec3::ZERO, Vec3::Y),
        CascadeShadowConfigBuilder { num_cascades: 1, maximum_distance: 100.0, ..default() }.build(),
    ));

    // câmera do FFT: 32 graus de inclinação, 45 de giro, a 30 m do foco
    let (yaw, pitch) = (45f32.to_radians(), 32f32.to_radians());
    let focus = Vec3::new(0.0, STEP, 0.0);
    let cam = (
        Camera3d::default(),
        Msaa::Off,
        Projection::from(OrthographicProjection { scaling_mode: ScalingMode::FixedVertical { viewport_height: FIT }, ..OrthographicProjection::default_3d() }),
        Transform::from_translation(focus + Vec3::new(yaw.sin() * pitch.cos(), pitch.sin(), yaw.cos() * pitch.cos()) * 30.0).looking_at(focus, Vec3::Y),
        GameCam,
    );
    if px.0 == 0 {
        commands.spawn(cam);
    } else {
        // pixel art: a cena vai para uma imagem pequena, esticada na tela sem filtro
        let mut canvas = Image::new_target_texture(64, 64, TextureFormat::Bgra8UnormSrgb, None);
        canvas.sampler = ImageSampler::nearest();
        canvas.asset_usage = RenderAssetUsages::all();
        let canvas = images.add(canvas);
        commands.spawn((cam, Camera { order: -1, ..default() }, RenderTarget::Image(canvas.clone().into())));
        commands.spawn((Camera2d, Msaa::Off));
        commands.spawn((ImageNode::new(canvas.clone()), Node { position_type: PositionType::Absolute, width: percent(100), height: percent(100), ..default() }));
        commands.insert_resource(Canvas(canvas));
    }

    // 1 texto e 1 botão, para sentir o custo de UI e toque
    commands.spawn((
        Node { position_type: PositionType::Absolute, left: px_val(12), bottom: px_val(12), column_gap: px_val(12), align_items: AlignItems::Center, ..default() },
        children![
            (
                Button,
                Node { width: px_val(132), height: px_val(48), justify_content: JustifyContent::Center, align_items: AlignItems::Center, border: UiRect::all(px_val(2)), ..default() },
                BorderColor::all(Color::srgb_u8(0xc9, 0xa2, 0x4d)),
                BackgroundColor(Color::srgb_u8(0x2a, 0x21, 0x3d)),
                children![(Text::new("Confirmar 0"), TextFont { font_size: FontSize::Px(18.0), ..default() })],
                observe(|click: On<Activate>, kids: Query<&Children>, mut texts: Query<&mut Text>, mut n: Local<u32>| {
                    *n += 1;
                    if let Ok(mut t) = texts.get_mut(kids.get(click.entity).unwrap()[0]) {
                        **t = format!("Confirmar {}", *n);
                    }
                }),
            ),
            (Text::new("fps"), TextFont { font_size: FontSize::Px(18.0), ..default() }, FpsText),
        ],
    ));
}

fn px_val(v: i32) -> Val {
    px(v)
}

fn play_idle(ready: On<WorldInstanceReady>, mut commands: Commands, kids: Query<&Children>, idles: Query<&Idle>, mut players: Query<&mut AnimationPlayer>, mut count: ResMut<Ready>) {
    let Ok(idle) = idles.get(ready.entity) else { return };
    for child in kids.iter_descendants(ready.entity) {
        if let Ok(mut player) = players.get_mut(child) {
            player.play(idle.1).repeat();
            commands.entity(child).insert(AnimationGraphHandle(idle.0.clone()));
        }
    }
    count.0 += 1;
    if count.0 == UNITS.len() {
        info!("DT_READY"); // o medidor lê isso no console: todos os bonecos na cena
    }
}

// enquadra o mapa como o resize() do scene.ts e mantém a imagem do pixel art no tamanho da janela
fn fit(window: Single<&Window, With<PrimaryWindow>>, mut cam: Single<&mut Projection, With<GameCam>>, px: Res<Px>, canvas: Option<Res<Canvas>>, mut images: ResMut<Assets<Image>>) {
    let (w, h) = (window.width().max(1.0), window.height().max(1.0));
    let a = w / h;
    let view = if a < 1.0 { FIT / 1.5 * 1.15 / a } else { FIT };
    if let Projection::Orthographic(o) = &mut **cam {
        if !matches!(o.scaling_mode, ScalingMode::FixedVertical { viewport_height } if viewport_height == view) {
            o.scaling_mode = ScalingMode::FixedVertical { viewport_height: view };
        }
    }
    if let Some(canvas) = canvas {
        let size = Extent3d { width: (w as u32 / px.0).max(1), height: (h as u32 / px.0).max(1), depth_or_array_layers: 1 };
        if images.get(&canvas.0).is_some_and(|i| i.texture_descriptor.size != size) {
            images.get_mut(&canvas.0).unwrap().resize(size);
        }
    }
}

fn fps(diag: Res<DiagnosticsStore>, mut text: Single<&mut Text, With<FpsText>>, mut frame: Local<u32>) {
    *frame += 1;
    if *frame % 30 != 0 {
        return;
    }
    if let Some(v) = diag.get(&FrameTimeDiagnosticsPlugin::FPS).and_then(|d| d.smoothed()) {
        ***text = format!("{v:.0} fps");
    }
}
