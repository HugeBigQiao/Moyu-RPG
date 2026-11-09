<template>
  <div class="page">
    <div class="home-hero">
      <h1>玄门诡事录</h1>
      <p>现代中国，祟物由人心淤积而成。修行者不是英雄，是来收尾的人。</p>
    </div>

    <div class="home-grid">
      <router-link to="/game" class="big-card play">
        <div class="idx">01 / PLAY</div>
        <h2>开始游戏</h2>
        <p>
          进入中国地图，选一座城：看它现在的任务、势力与在册人物，
          就地生成人物、开一桩案子。城市等级决定这地方能长出多复杂的人。
        </p>
        <div class="glyph">战</div>
        <div class="go">进入 →</div>
      </router-link>

      <router-link to="/archive/cities" class="big-card">
        <div class="idx">02 / ARCHIVE</div>
        <h2>背景档案</h2>
        <p>
          城市、人物、机构、教派、行业、国家、世界背景、事件库、
          任务库、装备库、人物特性库。每个档案独立成页，左侧目录、右侧正文。
        </p>
        <div class="glyph">档</div>
        <div class="go">翻阅 →</div>
      </router-link>
    </div>
  </div>
</template>
